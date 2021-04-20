import ItemWrapper from './itemWrapper';
import SourceItemWrapper from './sourceItemWrapper';
import Wikicite from './wikicite';

/* global Services */
/* global Zotero ZoteroPane */
/* global window */

export default class LCN{
    constructor(items) {
        if (!items.length) return
        this.itemMap = new Map;  // itemKey/tmpItemKey -> ItemWrapper

        // keys of the Zotero items treated as LCN "input items"
        this.inputKeys = items.map((item) => item.key);
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
                    // if citation's target item is linked to a Zotero item...
                    if (!this.inputKeys.includes(citation.target.key)) {
                        // ... and the linked-to Zotero item has not been
                        // selected (i.e., it is not an input item),
                        // add the linked-to item to the item map.

                        const linkedToItem = Zotero.Items.getByLibraryAndKey(
                            this.libraryID,
                            citation.target.key
                        );
                        // Non-linked citation target items are not part of the
                        // LCN "input items" set.
                        // Citations of these non-linked citation target items
                        // are unknown.
                        // This citation's target item is linked to a Zotero item
                        // which is not part of the LCN "input items" set either.
                        // For consistency, citations of this Zotero item should be
                        // unknown as well.
                        // Therefore, wrapping it in a regular ItemWrapper,
                        // without citations.
                        this.itemMap.set(
                            citation.target.key,
                            new ItemWrapper(linkedToItem)
                        );
                    }
                }
                else {
                    // the citation's target item is not linked to a Zotero item;
                    // give it a temporary key, but first make sure it hasn't been
                    // given one already (i.e, another source item --that cites the
                    // same target item-- has been processed already)

                    // collect item's unique identifiers (including name) and clean
                    // them, to make sure the same item always gets the same tmp key
                    const cleanDOI = Zotero.Utilities.cleanDOI(citation.target.doi);
                    const cleanISBN = Zotero.Utilities.cleanISBN(citation.target.isbn);
                    const qid = citation.target.qid;
                    const uids = {
                        doi: cleanDOI && cleanDOI.toUpperCase(),
                        isbn: cleanISBN,
                        occ: citation.target.occ,  // Fixme: provide OCC cleaning function
                        qid: qid && qid.toUpperCase(),
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
        }
    }

    openItem(key) {
        ZoteroPane.selectItem(
            Zotero.Items.getIDFromLibraryAndKey(this.libraryID, key)
        );
        window.focus();
    }

    show() {
        const windowFeatures = [
            'chrome',
            'dialog=no',
            'centerscreen',
            'resizable',
            `height=${window.screen.availHeight*0.9}`,
            `width=${window.screen.availWidth*0.9}`
        ]
        window.openDialog(
            'chrome://wikicite/content/Local-Citation-Network/index.html?API=Cita&listOfKeys=' + this.inputKeys.join(','),
            '',
            windowFeatures.join(','),
            this.itemMap,
            this.openItem.bind(this),
            Zotero.launchURL
        );
    }
}
