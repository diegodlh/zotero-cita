import SourceItemWrapper from './sourceItemWrapper';
import Wikicite from './wikicite';

/* global Services */
/* global Zotero ZoteroPane */
/* global window */

export default class LCN{
    constructor(items) {
        if (!items.length) return
        this.itemMap = new Map;  // itemKey/tmpItemKey -> ItemWrapper
        this.inputKeys = [];
        this.libraryID = items[0].libraryID;  // all items will belong to same library
        const tmpKeyMap = new Map;  // uid/title -> tmpKey
        // Fixme: this may take some time; make sure it doesn't block anything
        for (const item of items) {
            const wrappedItem = new SourceItemWrapper(item);
            // try and link citations; if success, save
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
                    // Fixme: clean ids below; otherwise, they may not match
                    const uids = {
                        doi: citation.target.doi,
                        isbn: citation.target.isbn,
                        occ: citation.target.occ,
                        qid: citation.target.qid,
                        title: citation.target.title
                    };

                    const tmpKeys = new Set();
                    for (const [key, value] of Object.entries(uids)) {
                        const tmpKey = tmpKeyMap.get(`${key}:${value}`);
                        if (tmpKey) tmpKeys.add(tmpKey);
                    }

                    let tmpKey;
                    if (tmpKeys.size === 0) {
                        do {
                            tmpKey = 'tmp' + String(
                                Math.round(Math.random()*100000)
                            ).padStart(5, '0');
                        } while (this.itemMap.has(tmpKey));
                    } else if (tmpKeys.size === 1) {
                        tmpKey = [...tmpKeys][0];
                    } else {
                        throw Error('UIDs of a citation target item should not refer to different temporary item keys');
                    }

                    for (const [key, value] of Object.entries(uids)) {
                        if (value) tmpKeyMap.set(`${key}:${value}`, tmpKey);
                    }

                    wrappedItem.citations[i].target.key = tmpKey;
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
