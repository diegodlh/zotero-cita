import Progress from './progress';
import WBK from 'wikibase-sdk';
import Wikicite from './wikicite';

/* global Services */
/* global Zotero */

// Fixme: Wikibase instance and Sparql Endpoint should be
// specified in the plugin preferences, to support other
// Wikibase instances.
const WBK_INSTANCE = 'https://www.wikidata.org';
const WBK_SPARQL = 'https://query.wikidata.org/sparql';

// Fixme: have it as a global variable like this,
// or as an instance variable like below? Pros and cons of each?
// This isn't redeclared each time the module is imported, is it?
const wdk = WBK({
    instance: WBK_INSTANCE,
    sparqlEndpoint: WBK_SPARQL
})

export default class {
    constructor() {
        this.wdk = WBK({
          instance: WBK_INSTANCE,
          sparqlEndpoint: WBK_SPARQL
      })
    }

    // items must be item wrappers
    static async getQID(items, create=false) { //, approximate, getCitations=true) {
        const progress = new Progress();
        if (!Array.isArray(items)) items = [items];
        let identifiers = items.reduce((identifiers, item) => {
            if (!item.qid) {
                const cleanDoi = Zotero.Utilities.cleanDOI(item.doi);
                const cleanIsbn = Zotero.Utilities.cleanISBN(item.isbn);
                if (cleanDoi) {
                    identifiers.push(cleanDoi.toUpperCase());
                } else if (cleanIsbn) {
                    identifiers.push(cleanIsbn);
                }
            }
            return identifiers;
        }, []);
        identifiers = [...new Set(identifiers)];
        if (identifiers.length) {
            const identifierString = identifiers.map(
                (identifier) => `"${identifier}"`
            ).join(" ");
            const sparql = `
SELECT ?item ?itemLabel ?doi ?isbn WHERE {
    VALUES ?identifier { ${identifierString} }.
    ?item (wdt:P356|wdt:P212|wdt:P957) ?identifier.
    OPTIONAL {
        ?item wdt:P356 ?doi.
    }
    OPTIONAL {
        ?item wdt:P212 ?isbn
    }    
    OPTIONAL {
        ?item wdt:P957 ?isbn
    }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE]". }
}
            `
            const url = wdk.sparqlQuery(sparql);
            progress.newLine('loading', 'Fetching QIDs');
            const xmlhttp = await Zotero.HTTP.request('GET', url);
            const results = JSON.parse(xmlhttp.response).results;
            if (results && results.bindings && results.bindings.length) {
                progress.updateLine('done', 'QIDs fetched successfully')
                for (const item of items.filter((item) => !item.qid)) {
                    let matches;
                    if (item.doi) {
                        matches = results.bindings.filter(
                            (binding) => binding.doi.value === item.doi.toUpperCase()
                        );
                    } else if (item.isbn) {
                        matches = results.bindings.filter(
                            (binding) => binding.isbn.value === item.isbn
                        );
                    }
                    if (matches.length) {
                        const qids = matches.map(
                            (match) => match.item.value.split('/').slice(-1)[0]
                        );
                        // if multiple entities found, choose the oldest one
                        item.qid = qids.sort()[0];
                    }
                }
            } else {
                progress.updateLine('error', 'No Wikidata entries were found');
            }
        } else {
            progress.newLine('error', 'No valid unique identifiers provided')
        }
        // Fixme: approximate search should be available for all items for which a
        // qid could not be returned before trying to create a new entity
        if (items.filter((item) => !item.qid).length) {
            Services.prompt.alert(
                null,
                'Title query unsupported',
                'QID could not be fetched for some items, and title query not yet supported'
            );
            // approximate parameter to use fields other than UIDs
            // this should either use MediaWiki API's wbsearchentities or query actions
            // see https://stackoverflow.com/questions/37170179/wikidata-api-wbsearchentities-why-are-results-not-the-same-in-python-than-in-wi
            // but as I understand one Api call would be made for each query, I would limit
            // this to single item searches (i.e. not item arrays)
            // if (items.length < 2) {}
            // https://www.wikidata.org/w/api.php?action=wbsearchentities&search=social interaction and conceptual change&format=json&language=en
            // I may have to show confirmation dialogs for user to confirm
            // but maybe this is intrusive for automatic runs (install, or new item)
            // maybe additional option too?
        }

        // handle offer create new one if not found
        // maybe just send them to the webpage, idk
        if (create) {
            Services.prompt.alert(
                window,
                'Unsupported',
                'Creating new entities in Wikidata not yet supported'
            )
        }
        progress.close();
    }

    /**
     * Creates a Wikidata element for an item.
     */
    static setQID(item) {
        let qid
        // make sure I'm not generating a duplicate before creating a QID for an item
        // somewhere I will have to map itemType to Wikidata supported instances of
        return qid
    }

    /**
     * Gets "cites work" (P2860) values from Wikidata for one or more entities
     * @param {Array} sourceQIDs - Array of one or more entity QIDs
     * @returns {Promise} Citations map { entityQID: [cites work QIDs]... }
     */
    static async getCitations(sourceQIDs) {
        // Fixme: alternatively, use the SPARQL endpoint to get more than 50
        // entities per request, and to get only the claims I'm interested in
        // (i.e., P2860).
        const urls = wdk.getManyEntities({
            ids: sourceQIDs,
            props: ['claims'],
            format: 'json'
        });
        const citations = new Map();
        while (urls.length) {
            const url = urls.shift();
            try {
                const xmlhttp = await Zotero.HTTP.request('GET', url);
                // Fixme: handle entities undefined
                const entities = JSON.parse(xmlhttp.response).entities;
                for (const id of Object.keys(entities)) {
                    const entity = entities[id];
                    const entityCitations = new Set();
                    if (entity.claims && entity.claims.P2860) {
                        for (const claim of entity.claims.P2860) {
                            if (claim.mainsnak) {
                                entityCitations.add(claim.mainsnak.datavalue.value.id);
                            }
                        }
                    }
                    citations[id] = [...entityCitations];
                }
            } catch (err) {
                console.log(err);
            }
        }
        return citations;
    }

    /**
     * Returns Zotero items using metadata retrieved from Wikidata for the QIDs provided
     * @param {Array} qids - Array of one or more QIDs to fetch metadata for
     * @returns {Promise} - Map of QIDs and their corresponding Zotero item
     */
    static async getItems(qids) {
        const itemMap = new Map(
            qids.map((qid) => [qid, undefined])
        );
        // Fixme: if called too early, it will fail!
        await Zotero.Schema.schemaUpdatePromise;
        const translate = new Zotero.Translate.Search();
        translate.setTranslator('fb15ed4a-7f58-440e-95ac-61e10aa2b4d8');  // Wikidata API
        translate.search = qids.map((qid) => ({extra: `qid: ${qid}`}));
        // Fixme: handle "no items returned from any translator" error
        const jsonItems = await translate.translate({libraryID: false});
        for (const jsonItem of jsonItems) {
            // delete irrelevant fields to avoid warnings in Item#fromJSON
            delete jsonItem['notes'];
            delete jsonItem['seeAlso'];
            delete jsonItem['attachments'];

            // convert JSON item returned by translator into full Zotero item
            const item = new Zotero.Item();
            item.fromJSON(jsonItem);

            const qid = Wikicite.getExtraField(item, 'qid').values[0];
            itemMap[qid] = item;
        }
        return itemMap;
    }

    static addCitations(sourceQID, targetQID) {
        // Is there a lenght limit in calls to Wikidata API?
        // I need wikidata-js here
        // I can provide an array of (sourceQID, targetQID)s for batch operations
        // returns a promise

        // for each sourceQID, get current citations from wikidata
        // for each targetQID, ignore those in wikidata already
        // add remaining citations
    }

    static deleteCitations(sourceQID, targetQID) {
        // I can provide an array of (sourceQID, targetQID)s for batch operations
        // returns a promise
    }
}
