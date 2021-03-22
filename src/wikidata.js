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

const properties = {
    'citesWork': 'P2860',
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
    // tags: ['Zotero_WikiCite']
});

export default class {
    constructor() {
        this.wdk = WBK({
            instance: WBK_INSTANCE,
            sparqlEndpoint: WBK_SPARQL
        })
    }

    // Fixme: add title query support. This is needed before
    // upload to Wikidata is implemented. Rethink flow and progress windows.
    // items must be item wrappers
    static async getQID(items, create=false) { //, approximate, getCitations=true) {
        const progress = new Progress();
        if (!Array.isArray(items)) items = [items];
        items = items.map((item) => ({ item: item, qid: item.qid }));
        let identifiers = items.reduce((identifiers, item) => {
            const cleanDoi = Zotero.Utilities.cleanDOI(item.item.doi);
            const cleanIsbn = Zotero.Utilities.cleanISBN(item.item.isbn);
            if (cleanDoi) {
                identifiers.push(cleanDoi.toUpperCase());
            } else if (cleanIsbn) {
                identifiers.push(cleanIsbn);
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
            progress.newLine(
                'loading',
                Wikicite.getString(
                    'wikicite.wikidata.progress.qid.fetch.loading'
                )
            );
            let bindings;
            try {
                const xmlhttp = await Zotero.HTTP.request('GET', url);
                bindings = JSON.parse(xmlhttp.response).results.bindings;
            } catch {
                progress.updateLine(
                    'error',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.qid.fetch.error'
                    )
                );
            }
            if (bindings.length) {
                progress.updateLine(
                    'done',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.qid.fetch.done'
                    )
                );
                // for (const item of items.filter((item) => !item.qid)) {
                for (const item of items) {
                    let matches;
                    if (item.item.doi) {
                        matches = bindings.filter(
                            (binding) => binding.doi.value === item.item.doi.toUpperCase()
                        );
                    } else if (item.item.isbn) {
                        matches = bindings.filter(
                            (binding) => binding.isbn.value === item.item.isbn
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
                progress.updateLine(
                    'error',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.qid.fetch.zero'
                    )
                );
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
        // issue #33
        if (create) {
            Services.prompt.alert(
                window,
                'Unsupported',
                'Creating new entities in Wikidata not yet supported'
            )
        }
        progress.close();
        return items;
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
        // Fixme: alternatively, use the SPARQL endpoint to get more than 50
        // entities per request, and to get only the claims I'm interested in
        // (i.e., P2860).
        const urls = wdk.getManyEntities({
            ids: sourceQIDs,
            props: ['claims'],
            format: 'json'
        });
        const citesWorkClaims = new Map();
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
        // REMOVE!!
        const sandboxItems = [
            'Q4115189', 'Q13406268', 'Q15397819'
        ];

        const username = {value: undefined};
        const password = {value: undefined};
        let anonymous = false;

        let cancelled = false;

        const results = {}

        for (const id of Object.keys(citesWorkClaims)) {
            // REMOVE!!
            if (!sandboxItems.includes(id)) {
                results[id] = 'non-sandbox';
                continue;
            }
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
                        "Save login credentials",
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
                        results[id] = error;
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
