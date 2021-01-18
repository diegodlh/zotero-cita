import WBK from 'wikibase-sdk';
import Wikicite from './wikicite';

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
    static getQID(items, approximate, getCitations=true) {
        // maybe it's better to provide items instead of itemIDs
        // in case I want to use this for targetItems (which don't
        // have a zotero item id)

        // get QID for item (if not available already)
        // batch call or multiple calls to Wikidata api?
        
        // in principle maybe just items with DOI
        // later, maybe with title too
        // if no DOI: "Fetching QID for items without DOI not yet supported"
        // "Please, fill in the DOI field, or enter the QID manually".

        // I may have to show confirmation dialogs for user to confirm
        // but maybe this is intrusive for automatic runs (install, or new item)
        // maybe additional option too?
        // approximate parameter to use fields other than UIDs

        // can I ask for cites work properties at the same time? maybe with getCitations boolean parameter?
        // or have separate call later?
        // handle offer create new one if not found
        // maybe just send them to the webpage, idk
        // call setExtraField for each of them to set QID
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
