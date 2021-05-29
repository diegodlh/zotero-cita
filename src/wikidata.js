import Wikicite, { debug } from './wikicite';
import Progress from './progress';
import WBK from 'wikibase-sdk';
import qs2wbEdit from 'quickstatements-to-wikibase-edit';
import wbEdit from 'wikibase-edit';

/* global Components */
/* global Services */
/* global Zotero */
/* global window */

const wbSdkVersion = require('wikibase-sdk/package.json').version;
const wbEditVersion = require('wikibase-edit/package.json').version;

// Fixme: Wikibase instance and Sparql Endpoint should be
// specified in the plugin preferences, to support other
// Wikibase instances.
const WBK_INSTANCE = 'https://www.wikidata.org';
const WBK_SPARQL = 'https://query.wikidata.org/sparql';
const RECONCILE_API = 'https://wikidata.reconci.link/en/api'

const entities = {
    'work': 'Q386724'
}

const properties = {
    'author': 'P50',
    'authorNameString': 'P2093',
    'citesWork': 'P2860',
    'doi': 'P356',
    'instanceOf': 'P31',
    'isbn10': 'P957',
    'isbn13': 'P212',
    'publicationDate': 'P577',
    'statedIn': 'P248',
    'refUrl': 'P854',
    'citoIntention': 'P3712'
};

// Fixme: have it as a global variable like this,
// or as an instance variable like below? Pros and cons of each?
// This isn't redeclared each time the module is imported, is it?
const wdk = WBK({
    instance: WBK_INSTANCE,
    sparqlEndpoint: WBK_SPARQL
});

const wdEdit = wbEdit({
    instance: WBK_INSTANCE,
    // maxlag may be ommited for interactive tasks where a user is waiting for the result
    // https://www.mediawiki.org/wiki/Manual:Maxlag_parameter
    maxlag: null,
    // tags: ['Zotero_WikiCite']
});

export default class {
    constructor() {
        this.wdk = WBK({
            instance: WBK_INSTANCE,
            sparqlEndpoint: WBK_SPARQL
        })
    }

    /**
     * Fetches QIDs for item wrappers provided, using reconciliation API
     * @param {Array|ItemWrapper} items (Array of) ItemWrapper(s)
     * @param {Object} options
     * @param {Boolean} options.overwrite Whether to overwrite item's known QID
     * @param {Boolean} options.partial Whether to suggest approximate matches
     * @param {Boolean} options.create Offer to create entity if not found in Wikidata
     * @returns {Map} item to qid map; qid is null if not found, and undefined if not queried
     */
    static async reconcile(items, options={overwrite: false, partial: undefined, create: undefined}) {
        const progress = new Progress();
        // make sure an array of items was provided
        if (!Array.isArray(items)) items = [items];
        // some options default values depend on number of items provided
        if (typeof options.partial === 'undefined') {
            options.partial = items.length === 1;
        }
        if (typeof options.create === 'undefined') {
            options.create = items.length === 1;
        }
        // create item -> qid map that will be returned at the end
        const qids = new Map(items.map((item) => [item, item.qid]));
        // iterate over the items to create the qXX query objects
        const queries = {};
        items.forEach((item, i) => {
            if (item.qid && !options.overwrite) {
                // current item has qid already
                return;
            }
            const queryProps = [];
            const cleanDOI = Zotero.Utilities.cleanDOI(item.doi);
            if (cleanDOI) {
                queryProps.push({
                    pid: properties.doi,
                    v: cleanDOI.toUpperCase()
                });
            }
            const cleanISBN = Zotero.Utilities.cleanISBN(item.isbn);
            if (cleanISBN) {
                queryProps.push({
                    pid: [properties.isbn10, properties.isbn13].join('|'),
                    v: cleanISBN
                })
            }
            // multiple matching creators decrease rather than increase
            // matching score
            // see https://www.wikidata.org/wiki/Wikidata_talk:Tools/OpenRefine#Reconcile_using_several_authors
            // const creators = item.item.getCreatorsJSON();
            // if (creators) {
            //     queryProps.push({
            //         pid: [properties.author, properties.authorNameString].join('|'),
            //         v: creators.map(
            //             (creator) => [creator.firstName, creator.lastName].join(' ').trim()
            //         )
            //     })
            // }
            // const year = Zotero.Date.strToDate(item.item.getField('date')).year;
            // if (year) {
            //     queryProps.push({
            //         pid: properties.publicationDate + '@year',
            //         v: year
            //     })
            // }
            if (!item.title && !queryProps.length) {
                // if no title nor supported properties, skip to next item
                return;
            }
            queries[`q${i}`] = {
                // Workaround until #84 can be fixed
                query: item.title.replace(/^(\w+):/, "$1"),
                type: entities.work,
                type_strict: 'should',
                properties: queryProps,
                // limit: 3,                                ]
            }
        })
        if (Object.keys(queries).length) {
            progress.newLine(
                'loading',
                Wikicite.getString(
                    'wikicite.wikidata.progress.qid.fetch.loading'
                )
            );
            // send HTTP POST request
            let response = {};
            try {
                const req = await Zotero.HTTP.request(
                    'POST',
                    RECONCILE_API,
                    {
                        body: `queries=${encodeURIComponent(JSON.stringify(queries))}`,
                        headers: {
                            'User-Agent': `${Wikicite.getUserAgent()} zotero/${Zotero.version}`
                        },
                        // Fixme: split large requests instead of disabling timeout #78
                        timeout: 0
                    }
                );
                response = JSON.parse(req.response);
                if (Object.values(response).some((query) => query.result.length)) {
                    // query batch succeeded and at least one query returned results
                    progress.updateLine(
                        'done',
                        Wikicite.getString(
                            'wikicite.wikidata.progress.qid.fetch.done'
                        )
                    );
                } else {
                    // query batch succeeded, but no query returned results
                    progress.updateLine(
                        'error',
                        Wikicite.getString(
                            'wikicite.wikidata.progress.qid.fetch.zero'
                        )
                    );
                }
            } catch (err) {
                // Handle too large batch error until openrefine-wikibase#109 is fixed
                let largeBatch = false;
                if (err.xmlhttp && err.xmlhttp.response) {
                    const details = JSON.parse(err.xmlhttp.response).details;
                    if (details) {
                        const match = details.match(
                            /url=URL\('https:\/\/query\.wikidata\.org\/sparql\?query=(.*)&format=json'\)/
                        );
                        if (match) {
                            const query = match[1];
                            if (query.length > 7442) {
                                largeBatch = true
                            }
                        }
                    }
                }
                progress.updateLine(
                    'error',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.qid.fetch.error' +
                        (largeBatch ? '.large-batch' : '')
                    )
                );
            }
            progress.close();
            let cancelled = false;
            items.forEach((item, i) => {
                if (cancelled) {
                    return;
                }
                if (item.qid && !options.overwrite) {
                    return;
                }
                const query = response[`q${i}`];
                if (query) {
                    const candidates = query.result;
                    const match = candidates.filter((candidate) => candidate.match)[0];
                    if (match) {
                        qids.set(item, match.id);
                    } else if (candidates.length && options.partial) {
                        const choices = [
                            Wikicite.getString(
                                'wikicite.wikidata.reconcile.approx.none'
                            ),
                            ...candidates.map(
                                (candidate) => `${candidate.name} (${candidate.id})`
                            )
                        ]
                        const selection = {};
                        const select = Services.prompt.select(
                            window,
                            Wikicite.getString('wikicite.wikidata.reconcile.approx.title'),
                            Wikicite.formatString(
                                'wikicite.wikidata.reconcile.approx.message',
                                item.title
                            ),
                            choices.length,
                            choices,
                            selection
                        );
                        if (select) {
                            if (selection.value > 0) {
                                const index = selection.value - 1;
                                qids.set(item, candidates[index].id);
                            } else {
                                // user chose 'none', meaning no candidate is relevant
                                // set qid to 'null' meaning no results where found
                                qids.set(item, null);
                            }
                        } else {
                            // user cancelled
                            // leave qid 'undefined' in qids map
                            cancelled = true;
                        }
                    } else {
                        // item is in the response
                        // but response is empty
                        // meaning it wasn't found in Wikidata
                        // make it 'null' in the qids maps
                        qids.set(item, null);
                    }
                } else {
                    // item not in the response:
                    // either not included in the query
                    // or query failed altogether
                    // remains 'undefined' in the qids map
                }
            })
        } else {
            // no searchable items, or qids known already
            progress.newLine(
                'error',
                Wikicite.getString(
                    'wikicite.wikidata.progress.qid.fetch.invalid'
                )
            );
            progress.close();
        }
        // select items unavailable in Wikidata for entity creation
        const unavailable = [];
        for (const [item, qid] of qids) {
            if (qid === null) {
                if (!item.title) {
                    // skip items without a title
                    continue;
                }
                unavailable.push(item);
            }
        }
        if (unavailable.length && options.create) {
            const result = Services.prompt.confirm(
                window,
                Wikicite.getString(
                    'wikicite.wikidata.reconcile.unavailable.title'
                ),
                Wikicite.formatString(
                    'wikicite.wikidata.reconcile.unavailable.message',
                    unavailable.map((item) => item.title).join('\n')
                )
            )
            if (result) {
                for (const item of unavailable) {
                    const qid = await this.create(item, {checkDuplicates: false});
                    qids.set(item, qid);
                }
            }
        }
        return qids;
    }

    static cleanQID(qid) {
        qid = qid.toUpperCase().trim();
        if (qid[0] !== 'Q') qid = 'Q' + qid;
        if (!qid.match(/^Q\d+$/)) qid = '';
        return qid;
    }

    /**
     * DEPRECATED - use this.reconcile() instead
     * Fetches QIDs for item wrappers provided and returns item -> QID map
     */
    static async getQID(items, create=false) { //, approximate, getCitations=true) {
        const progress = new Progress();
        // make sure an array of items was provided
        if (!Array.isArray(items)) items = [items];
        // create item -> qid map that will be returned at the end
        const qidMap = new Map(items.map((item) => [item, item.qid]));
        // one pool of identifiers to match against, across items and PID type
        let identifiers = items.reduce((identifiers, item) => {
            // Fixme: support more PIDs
            // also support multiple PIDs per item (e.g., DOI & PMID)
            // see #51
            const cleanDoi = Zotero.Utilities.cleanDOI(item.doi);
            const cleanIsbn = Zotero.Utilities.cleanISBN(item.isbn);
            if (cleanDoi) {
                // Wikidata's P356 (DOI) value is automatically transformed
                // to uppercase https://www.wikidata.org/wiki/Property_talk:P356#Documentation
                identifiers.push(cleanDoi.toUpperCase());
            } else if (cleanIsbn) {
                identifiers.push(cleanIsbn);
            }
            return identifiers;
        }, []);
        identifiers = [...new Set(identifiers)];
        if (identifiers.length) {
            // if at least one supported identifier available,
            // run the SPARQL query
            const identifierString = identifiers.map(
                (identifier) => `"${identifier}"`
            ).join(' ');
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
            const [url, body] = wdk.sparqlQuery(sparql).split('?');
            progress.newLine(
                'loading',
                Wikicite.getString(
                    'wikicite.wikidata.progress.qid.fetch.loading'
                )
            );
            let results;
            try {
                // make POST request in case query is too long
                const xmlhttp = await Zotero.HTTP.request(
                    'POST',
                    url,
                    {
                        body: body,
                        headers: {
                            'User-Agent': `${Wikicite.getUserAgent()} wikibase-sdk/v${wbSdkVersion || '?'}`
                        }
                    }
                );
                results = wdk.simplify.sparqlResults(xmlhttp.response);
            } catch {
                progress.updateLine(
                    'error',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.qid.fetch.error'
                    )
                );
            }

            if (results.length) {
                progress.updateLine(
                    'done',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.qid.fetch.done'
                    )
                );
                for (const item of items) {
                    // matches are sparql results/entities whose doi or isbn
                    // match the current item doi or isbn
                    // Fixme: support other PIDs, see #51
                    let matches;
                    if (item.doi) {
                        matches = results.filter(
                            (result) => result.doi === item.doi.toUpperCase()
                        );
                    } else if (item.isbn) {
                        matches = results.filter(
                            (result) => result.isbn === item.isbn
                        );
                    }
                    if (matches.length) {
                        const qids = matches.map(
                            (match) => match.item.value
                        );
                        // if multiple entities found, choose the oldest one
                        const qid = qids.sort()[0];
                        // add matching qid to the qidMap to be returned
                        qidMap.set(item, qid);
                    }
                }
            } else {
                // no results from sparql query
                progress.updateLine(
                    'error',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.qid.fetch.zero'
                    )
                );
            }
        } else {
            // items provided have no supported PIDs (DOI, ISBN)
            progress.newLine('error', 'No valid unique identifiers provided')
        }
        // Fixme: approximate search should be available for all items for which a
        // qid could not be returned before trying to create a new entity
        if ([...qidMap.values()].some((qid) => typeof qid === 'undefined')) {
            // at least one of the items provided isn't mapped to a qid yet
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
        // issue #33
        if (create) {
            Services.prompt.alert(
                window,
                'Unsupported',
                'Creating new entities in Wikidata not yet supported'
            )
        }
        progress.close();
        return qidMap;
    }

    /**
     * Creates a Wikidata entity for an item wrapper provided
     * @param {ItemWrapper} item Wrapped Zotero item
     * @param {Object} options
     * @param {Boolean} options.checkDuplicates Whether to check for duplicates before proceeding
     * @returns {(String|undefined|null)} qid - QID of entity created, null if cancelled, or
     *     undefined if QID is unknown (created with QuickStatements)
     */
    static async create(item, options={checkDuplicates: true}) {
        if (options.checkDuplicates) {
            throw Error('Checking for duplicates within create function non-supported.');
        }
        if (!item.title) {
            throw Error('Cannot create an entity for an item without a title');
        }
        await Zotero.Schema.schemaUpdatePromise;
        const translation = new Zotero.Translate.Export();
        if (item.item.libraryID) {
            translation.setItems([item.item]);
        } else {
            // export translation expects the item to have a libraryID
            // target (i.e., cited) items in the CitationEditor do not have one
            // create temporary item
            const tmpItem = new Zotero.Item();
            tmpItem.fromJSON(item.item.toJSON());
            tmpItem.libraryID = 1;
            translation.setItems([tmpItem])
        }
        translation.setTranslator('51e5355d-9974-484f-80b9-f84d2b55782e');  // QuickStatements translator
        await translation.translate();
        const qsCommands = translation.string;
        let qid;
        if (qsCommands) {
            const buttonFlags = (
                (Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING) +
                (Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_IS_STRING) +
                (Services.prompt.BUTTON_POS_2 * Services.prompt.BUTTON_TITLE_CANCEL)
            );
            const response = Services.prompt.confirmEx(
                window,
                Wikicite.getString('wikicite.wikidata.create.confirm.title'),
                Wikicite.formatString(
                    'wikicite.wikidata.create.confirm.message',
                    item.title
                ),
                buttonFlags,
                Wikicite.getString('wikicite.wikidata.create.confirm.button.create'),
                Wikicite.getString('wikicite.wikidata.create.confirm.button.qs'),
                "",
                undefined,
                {}
            );
            switch (response) {
                case 0: {
                    // create
                    const confirm = Services.prompt.confirm(
                        window,
                        Wikicite.getString(
                            'wikicite.wikidata.create.auto.confirm.title'
                        ),
                        Wikicite.formatString(
                            'wikicite.wikidata.create.auto.confirm.message',
                            [
                                item.title,
                                'https://www.wikidata.org/wiki/Wikidata:Notability'
                            ]
                        )
                    )
                    if (!confirm) {
                        qid = null;
                        break;
                    }

                    // convert qs commands to wikibase-edit entity
                    const { creations } = qs2wbEdit(qsCommands);

                    // use wikibase-entity to create entity
                    const progress = new Progress(
                        'loading',
                        Wikicite.getString(
                            'wikicite.wikidata.create.auto.progress.loading'
                        )
                    );
                    const login = new Login();
                    do {
                        if (
                            !login.cancelled &&
                            (!login.anonymous || login.error)
                        ) {
                            login.prompt();
                        }
                        if (login.cancelled) {
                            qid = null;
                            progress.updateLine(
                                'error',
                                Wikicite.getString(
                                    'wikicite.wikidata.create.auto.progress.cancelled'
                                )
                            );
                            break;
                        }
                        const requestConfig = {
                            anonymous: login.anonymous,
                            credentials: login.credentials,
                            userAgent: `${Wikicite.getUserAgent()} wikibase-edit/v${wbEditVersion || '?'}`
                        };
                        resetCookies();
                        try {
                            const creation = creations[0];
                            const instanceOf = creation.claims[properties.instanceOf][0];
                            if (!instanceOf) throw new Error(
                                'Refused to create an item of an unknown class'
                            );
                            requestConfig.summary = Wikicite.formatString(
                                'wikicite.wikidata.create.auto.summary',
                                `[[${instanceOf}]]`
                            ) + ' [[[Wikidata:Zotero/Cita|Cita]]]'
                            const { entity } = await wdEdit.entity.create(
                                creation,
                                requestConfig
                            );
                            qid = entity.id
                            progress.updateLine(
                                'done',
                                Wikicite.getString(
                                    'wikicite.wikidata.create.auto.progress.done'
                                )
                            );
                        } catch (error) {
                            login.onError(error);
                                if (!login.error) {
                                    qid = null;
                                    progress.updateLine(
                                        'error',
                                        Wikicite.getString(
                                            'wikicite.wikidata.create.auto.progress.error'
                                        )
                                    );
                                }
                            }
                    } while (login.error);
                    progress.close();
                    break;
                }
                case 1: {
                    // quickstatements
                    const confirm = Services.prompt.confirm(
                        window,
                        Wikicite.getString(
                            'wikicite.wikidata.create.qs.title'
                        ),
                        Wikicite.getString(
                            'wikicite.wikidata.create.qs.message'
                        )
                    )
                    if (confirm) {
                        let copied = false;
                        // copy commands to clipboard
                        try {
                            Zotero.Utilities.Internal.copyTextToClipboard(qsCommands);
                            copied = true;
                        } catch {
                            throw new Error('Copy to clipboard failed!');
                        }
                        // launch QuickStatements
                        if (copied) Zotero.launchURL(
                            'https://quickstatements.toolforge.org/#/batch'
                        );
                        // return undefined qid (because it can't be known)
                        qid = undefined;
                    } else {
                        // return null qid (because user cancelled)
                        qid = null;
                    }
                    // // running QS through URL doesn't let edit the commands
                    // Zotero.launchURL(
                    //     'https://quickstatements.toolforge.org/#/v1=' +
                    //     qsCommands.replace(/\t/g, '|').replace(/\n/g, '||')
                    // );
                    // qid = undefined;
                    break;
                }
                case 2:
                    // cancel
                    qid = null;
                    break;
            }
        } else {
            // handle cases where the QS translator returns nothing?
            // e.g., if item has qid already - these items should have
            // been ignored by the function calling this.create()
            // we want to make sure no duplicate entries are created
            // for an item that might have a QID already!
        }
        return qid
    }

    /**
     * Gets "cites work" (P2860) values from Wikidata for one or more entities
     * @param {Array} sourceQIDs - Array of one or more entity QIDs
     * @returns {Promise} Citations map { entityQID: [cites work QIDs]... }
     */
    static async getCitesWorkClaims(sourceQIDs) {
        if (!Array.isArray(sourceQIDs)) sourceQIDs = [sourceQIDs];
        // Fixme: alternatively, use the SPARQL endpoint to get more than 50
        // entities per request, and to get only the claims I'm interested in
        // (i.e., P2860).
        const urls = wdk.getManyEntities({
            ids: sourceQIDs,
            props: ['claims'],
            format: 'json'
        });
        const citesWorkClaims = {};
        while (urls.length) {
            const url = urls.shift();
            try {
                const xmlhttp = await Zotero.HTTP.request(
                    'GET',
                    url,
                    {
                        headers: {
                            'User-Agent': `${Wikicite.getUserAgent()} wikibase-sdk/v${wbSdkVersion || '?'}`
                        }
                    }
                );
                // Fixme: handle entities undefined
                const { entities } = JSON.parse(xmlhttp.response);
                for (const id of Object.keys(entities)) {
                    const entity = entities[id];
                    if (entity.claims) {
                        // Note: we can't know what class(es) the "cites work"
                        // objects belong to. Hence, we may be returning
                        // entities of types not supported by Zotero.
                        citesWorkClaims[id] = wdk.simplify.propertyClaims(
                            entity.claims[properties.citesWork],
                            {
                                keepIds: true,
                                keepQualifiers: true,
                                keepReferences: true
                            }
                        );
                    }
                }
            } catch (err) {
                debug('Getting "cites work" claims failed', err);
            }
        }
        return citesWorkClaims;
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
        // this seems to fix that Zotero.Translate.Search() would fail if called
        // too early
        await Zotero.Schema.schemaUpdatePromise;
        const translate = new Zotero.Translate.Search();
        translate.setTranslator('fb15ed4a-7f58-440e-95ac-61e10aa2b4d8');  // Wikidata API
        translate.search = qids.map((qid) => ({extra: `qid: ${qid}`}));
        // Fixme: handle "no items returned from any translator" error
        let jsonItems;
        try {
            translate.requestHeaders = {
                'User-Agent': `${Wikicite.getUserAgent()} zotero/${Zotero.version}`
            }
            jsonItems = await translate.translate({libraryID: false});
        } catch (err) {
            if (err === translate.ERROR_NO_RESULTS) {
                jsonItems = [];
            } else {
                throw err;
            }
        }
        for (const jsonItem of jsonItems) {
            // delete irrelevant fields to avoid warnings in Item#fromJSON
            delete jsonItem['notes'];
            delete jsonItem['seeAlso'];
            delete jsonItem['attachments'];

            // convert JSON item returned by translator into full Zotero item
            const item = new Zotero.Item();
            item.fromJSON(jsonItem);

            const qid = Wikicite.getExtraField(item, 'qid').values[0];
            itemMap.set(qid, item);
        }
        return itemMap;
    }

    static async updateCitesWorkClaims(citesWorkClaims) {
        const login = new Login();
        const results = {};
        for (const id of Object.keys(citesWorkClaims)) {
            const actionType = getActionType(citesWorkClaims[id]);

            do {
                if (
                    !login.cancelled &&
                    (!login.anonymous || login.error)
                ) {
                    login.prompt();
                }
                if (login.cancelled) {
                    results[id] = 'cancelled';
                    break;
                }
                const requestConfig = {
                    anonymous: login.anonymous,
                    credentials: login.credentials,
                    userAgent: `${Wikicite.getUserAgent()} wikibase-edit/v${wbEditVersion || '?'}`
                };

                try {
                    resetCookies();
                    const res = await wdEdit.entity.edit(
                        {
                            id: id,
                            claims: {
                                [properties.citesWork]: citesWorkClaims[id]
                            },
                            summary: Wikicite.formatString(
                                'wikicite.wikidata.updateCitesWork.' + actionType,
                                `[[Property:${properties.citesWork}]]`
                            ) + ' [[[Wikidata:Zotero/Cita|Cita]]]'
                        }, requestConfig
                    );
                    if (res.success) {
                        login.onSuccess();
                        // res returned by wdEdit.entity.edit has an entity prop
                        results[id] = 'ok';
                    } else {
                        // is it even possible to get here without an error being
                        // thrown by wdEdit.entity.edit above, and caught below?
                        results[id] = 'unsuccessful'
                    }
                } catch (error) {
                    login.onError(error);
                    if (!login.error) {
                        // if not login error, save error name and proceed with next id
                        results[id] = error.name;
                    }
                }
            } while (login.error);
        }
        return results;

        // I deem the following uneccesary, because I would expect this method to
        // be called from a sync with Wikidata operation. Hence, this check should
        // have been done there. Maybe do ask for a lastrevid for each sourceQID
        // and fail if they do not match.
        // Or do get citations for checking if no lastrevid provided
        // for each sourceQID, get current citations from wikidata
        // for each targetQID, ignore those in wikidata already
        // add remaining citations
    }
}

// error to be displayed at top, explains why you need to log in
class Login {
    constructor() {
        this.error = false;
    }

    get credentials() {
        let credentials;
        if (!this.anonymous) {
            credentials = {};
            credentials.username = this.username;
            credentials.password = this.password;
        }
        return credentials;
    }

    onError(error) {
        this.error = false;
        if (error.name == 'badtoken') {
            if (this.anonymous) {
                // See https://github.com/maxlath/wikibase-edit/issues/63
                this.error = 'unsupportedAnonymous';
            } else {
                this.error = 'unknown';
            }
        } else if (error.message.split(':')[0] == 'failed to login') {
            this.error = 'wrongCredentials';
        }
        // I don't want permissiondenied errors to be treated as
        // login errors, because permission may have been denied
        // for just one of multiple edits requested, and the user
        // may not have other credentials, so they would get stuck
        // in a login-error loop, of which they can only get out
        // by cancelling, thus cancelling all edits (not just the
        // one they didn't have permission for)
    }

    onSuccess() {
        this.error = false;
        if (!this.anonymous && this.save) {
            debug('Saving credentials to be implemented');
        }
    }

    prompt() {
        let promptText = '';
        if (this.error) {
            promptText += Wikicite.getString(
                'wikicite.wikidata.login.error.' + this.error
            ) + '\n\n';
        }
        promptText += Wikicite.getString('wikicite.wikidata.login.message.main') + '\n\n';
        promptText += Wikicite.formatString(
            'wikicite.wikidata.login.message.create-account',
            'https://www.wikidata.org/w/index.php?title=Special:CreateAccount'
        ) + '\n\n';
        promptText += Wikicite.formatString(
            'wikicite.wikidata.login.message.bot-pass',
            'https://www.mediawiki.org/wiki/Special:BotPasswords'
        );

        const username = {value: this.username};
        const password = {value: undefined};
        const save = {value: false};
        let loginPrompt;
        do {
            loginPrompt = Services.prompt.promptUsernameAndPassword(
                window,
                Wikicite.getString('wikicite.wikidata.login.title'),
                promptText,
                username,
                password,
                null,  // "Save login credentials",
                save
            );
        // if user entered username and clicked OK but forgot password
        // display prompt again
        } while (loginPrompt && username.value && !password.value);
        if (loginPrompt) {
            this.username = username.value;
            this.password = password.value;
            this.anonymous = !this.username && !this.password;
            this.save = save.value;
        } else {
            // user cancelled login
            this.cancelled = true;
        }
    }
}

/**
 * For a set of claims, return the type of action
 * (add, edit, remove or update) that will be requested.
 */
function getActionType(claims) {
    let actionType;
    if (claims.some(claim => claim.id)) {
        if (claims.every(claim => claim.id)) {
            if (claims.every(claim => claim.remove)) {
                // all claims provided have an id and are to be removed
                actionType = 'remove';
            } else {
                // all claims provided have an id
                actionType = 'edit';
            }
        } else {
            // some (but not all) claims provided have an id
            actionType = 'update';
        }
    } else {
        // no claim provided has an id
        actionType = 'add';
    }
    return actionType;
}

function resetCookies() {
    // remove cookies for API host before proceeding
    const iter = Services.cookies.getCookiesFromHost(
        new URL(WBK_INSTANCE).host, {}
    );
    while (iter.hasMoreElements()) {
        const cookie = iter.getNext();
        if (cookie instanceof Components.interfaces.nsICookie) {
            Services.cookies.remove(cookie.host, cookie.name, cookie.path, false, {});
        }
    }
}

export class CitesWorkClaim {
    constructor(citesWorkClaimValue={}) {
        this.id = citesWorkClaimValue.id;
        this.value = citesWorkClaimValue.value;
        this.references = citesWorkClaimValue.references;
        this.qualifiers = citesWorkClaimValue.qualifiers;
        this.remove = false;
    }

    // get intentions() {
    //     return this.qualifiers[properties.citoIntention];
    // }

    // set intentions(intentionQualifiers) {
    //     this.qualifiers[properties.citoIntention] = intentionQualifiers;
    // }

    // addReference() {}

    // removeReference() {}

    // editReference() {}

    // addIntention() {}

    // removeIntention() {}
}

// class Reference {
//     // P248: 'Q5188229', //stated in; possible values would be Crossref, or OCC Q26382154
//     // P854: 'https://api.crossref.org/works/' // reference URL, I need doi for this
//     constructor(reference) {
//         this.statedIn = reference[properties.statedIn];
//         this.refUrl = reference[properties.refUrl];
//     }
// }

// class Qualifier {
//     constructor(qualifier) {}
// }

// class IntentionQualifier {
//     // P3712 objective of project or action
//     constructor(intentionQualifier) {
//         this.intentions = [];
//     }
// }
