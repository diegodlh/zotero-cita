import Progress from './progress';
import WBK from 'wikibase-sdk';
import Wikicite from './wikicite';
import wbEdit from 'wikibase-edit';

/* global Components */
/* global Services */
/* global Zotero */
/* global window */

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
     * @returns {Map} item to qid map; qid is null if not found, and undefined if not queried
     */
    static async reconcile(items, options={overwrite: true, partial: undefined}) {
        const progress = new Progress();
        // make sure an array of items was provided
        if (!Array.isArray(items)) items = [items];
        // default partial value depends on how many items provided
        if (typeof options.partial === 'undefined') {
            if (items.length > 1) {
                options.partial = false;
            } else {
                options.partial = true;
            }
        }
        // create item -> qid map that will be returned at the end
        const qids = new Map(items.map((item) => [item, item.qid]));
        // iterate over the items to create the qXX query objects
        const queries = {};
        items.forEach((item, i) => {
            if (item.qid && !options.overwrite) {
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
                    pid: [properties.isb10, properties.isbn13].join('|'),
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
                query: item.title,
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
                        body: `queries=${JSON.stringify(queries)}`
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
            } catch {
                progress.updateLine(
                    'error',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.qid.fetch.error'
                    )
                );
            }
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
            // no searchable items
            progress.newLine(
                'error',
                Wikicite.getString(
                    'wikicite.wikidata.progress.qid.fetch.invalid'
                )
            );
        }
        progress.close();
        return qids;
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
                const xmlhttp = await Zotero.HTTP.request('POST', url, {body: body});
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
                const xmlhttp = await Zotero.HTTP.request('GET', url);
                // Fixme: handle entities undefined
                const { entities } = JSON.parse(xmlhttp.response);
                for (const id of Object.keys(entities)) {
                    const entity = entities[id];
                    if (entity.claims) {
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
                console.log(err);
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

    static async updateCitesWorkClaims(citesWorkClaims) {
        const username = {value: undefined};
        const password = {value: undefined};
        let anonymous = false;

        let cancelled = false;

        const results = {}

        for (const id of Object.keys(citesWorkClaims)) {
            const actionType = getActionType(citesWorkClaims[id]);

            let loginError;
            if (!cancelled) do {
                const saveCredentials = {value: false};
                if (!anonymous && !password.value) {
                    let promptText = '';
                    if (loginError) {
                        promptText += Wikicite.getString(
                            'wikicite.wikidata.login.error.' + loginError
                        ) + '\n\n';
                    }
                    promptText += Wikicite.getString('wikicite.wikidata.login.message.main') + '\n\n';
                    promptText += Wikicite.formatString(
                        'wikicite.wikidata.login.message.createAccount',
                        'https://www.wikidata.org/w/index.php?title=Special:CreateAccount'
                    ) + '\n\n';
                    promptText += Wikicite.formatString(
                        'wikicite.wikidata.login.message.botPass',
                        'https://www.mediawiki.org/wiki/Special:BotPasswords'
                    );
                    const loginPrompt = Services.prompt.promptUsernameAndPassword(
                        window,
                        Wikicite.getString('wikicite.wikidata.login.title'),
                        promptText,
                        username,
                        password,
                        null,  // "Save login credentials",
                        saveCredentials
                    )
                    if (!loginPrompt) {
                        // user cancelled login
                        cancelled = true;
                        break;
                    }
                    anonymous = !username.value || !password.value;
                }
                const requestConfig = { anonymous: anonymous };
                if (!anonymous) {
                    requestConfig.credentials = {
                        username: username.value,
                        password: password.value
                    }
                }
                // reset loginError
                loginError = '';

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

                try {
                    const res = await wdEdit.entity.edit(
                        {
                            id: id,
                            claims: {
                                [properties.citesWork]: citesWorkClaims[id]
                            },
                            summary: Wikicite.getString(
                                'wikicite.wikidata.updateCitesWork.' + actionType
                            )
                        }, requestConfig
                    );
                    if (res.success) {
                        // res returned by wdEdit.entity.edit has an entity prop
                        results[id] = 'ok';
                    } else {
                        // is it even possible to get here without an error being
                        // thrown by wdEdit.entity.edit above, and caught below?
                        results[id] = 'unsuccessful'
                    }
                    if (saveCredentials.value && !anonymous) {
                        // Fixme
                        console.log('Saving credentials to be implemented');
                    }
                } catch (error) {
                    if (error.name == 'badtoken') {
                        if (anonymous) {
                            // See https://github.com/maxlath/wikibase-edit/issues/63
                            loginError = 'unsupportedAnonymous';
                        } else {
                            loginError = 'unknown';
                        }
                    } else if (error.message.split(':')[0] == 'failed to login') {
                        loginError = 'wrongCredentials';
                    }
                    if (loginError) {
                        // reset credentials and try again
                        password.value = undefined;
                        // anonymous edit may be failing for this specific edition
                        anonymous = false;
                    } else {
                        // I don't want permissiondenied errors to be treated as
                        // login errors, because permission may have been denied
                        // for just one of multiple edits requested, and the user
                        // may not have other credentials, so they would get stuck
                        // in a login-error loop, of which they can only get out
                        // by cancelling, thus cancelling all edits (not just the
                        // one they didn't have permission for)
                        results[id] = error.name;
                    }
                }
            } while (loginError);

            if (cancelled) {
                results[id] = 'cancelled';
            }
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
