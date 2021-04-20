import SourceItemWrapper from './sourceItemWrapper';
import Wikicite from './wikicite';

/* global Services */
/* global Zotero ZoteroPane */
/* global window */

export default class LCN{
    constructor(items) {
        if (!items.length) return
        this.itemMap = new Map;  // itemKey/tmpItemKey -> ItemWrapper
        this.inputKeys = [];  // keys of the Zotero items treated as LCN "input items"
        this.libraryID = items[0].libraryID;  // all items will belong to same library
        const tmpKeyMap = new Map;  // uid/title -> tmpKey
        // Fixme: this may take some time; make sure it doesn't block anything
        for (const item of items) {
            const wrappedItem = new SourceItemWrapper(item);
            // try and link citations; if success, save
            // do we want to limit the search to the set of items selected?
            // wrappedItem.linkCitations()
            for (let i = 0; i < wrappedItem.citations.length; i++) {
                const citation = wrappedItem.citations[i];
                if (citation.target.key) {
                    // if citation's target item is linked to a Zotero item,
                    // do not ignore, given that the linked-to Zotero item
                    // may not have been selected (hence, not an input item)
                    if (!this.itemMap.has(citation.target.key)) {
                        // but only add to the item map if the linked-to item
                        // has not been added already, because we don't want to
                        // overwrite the correspoding SourceItemWrapper
                        // with its citations
                        this.itemMap.set(citation.target.key, citation.target);
                    }
                }
                else {
                    // the citation's target item is not linked to a Zotero item;
                    // give it a temporary key, but first make sure it hasn't been
                    // given one already (i.e, another source item --that cites the
                    // same target item-- has been processed already)

                    // collect item's unique identifiers (including name) and clean
                    // them, to make sure the same item always gets the same tmp key
                    const uids = {
                        doi: Zotero.Utilities.cleanDOI(citation.target.doi).toUpperCase(),
                        isbn: Zotero.Utilities.cleanISBN(citation.target.isbn),
                        occ: citation.target.occ,  // Fixme: provide OCC cleaning function
                        qid: citation.target.qid.toUpperCase(),
                        title: citation.target.title.toLowerCase()
                    };

                    // retrieve tmp keys already given to this item,
                    // i.e., the target item of another source item's citation
                    // had one or more of the same uids or title
                    const tmpKeys = new Set();
                    for (const [key, value] of Object.entries(uids)) {
                        const tmpKey = tmpKeyMap.get(`${key}:${value}`);
                        if (tmpKey) tmpKeys.add(tmpKey);
                    }

                    let tmpKey;
                    if (tmpKeys.size === 0) {
                        // if no matching temp keys found, create a new one
                        do {
                            tmpKey = 'tmp' + String(
                                Math.round(Math.random()*100000)
                            ).padStart(5, '0');
                        // make sure randomly created key does not exist already
                        } while (this.itemMap.has(tmpKey));
                    } else if (tmpKeys.size === 1) {
                        // if one matching key found, use that one
                        tmpKey = [...tmpKeys][0];
                    } else {
                        // finding more than one matching key should be unexpected
                        throw Error(
                            'UIDs of a citation target item should not refer to different temporary item keys'
                        );
                    }

                    // save key to the map of temp keys
                    for (const [key, value] of Object.entries(uids)) {
                        if (value) tmpKeyMap.set(`${key}:${value}`, tmpKey);
                    }

                    // add temp key to the citation's target
                    wrappedItem.citations[i].target.key = tmpKey;
                    // save citation's target to the item map
                    this.itemMap.set(tmpKey, wrappedItem.citations[i].target);
                }
            }
            this.itemMap.set(wrappedItem.key, wrappedItem);
            this.inputKeys.push(wrappedItem.key);
        }
    }

    openItem(key) {
        ZoteroPane.selectItem(
            Zotero.Items.getIDFromLibraryAndKey(this.libraryID, key)
        );
        window.focus();
    }

    show() {
        window.openDialog(
            'chrome://wikicite/content/Local-Citation-Network/index.html?API=Cita&listOfKeys=' + this.inputKeys.join(','),
            '',
            'chrome,dialog=no,centerscreen,resizable=yes',
            this.itemMap,
            this.openItem.bind(this),
            Zotero.launchURL
        );
    }
}
