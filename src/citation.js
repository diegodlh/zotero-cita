import Wikidata, { CitesWorkClaim } from './wikidata';
import ItemWrapper from './itemWrapper';
import OCI from './oci';
import Wikicite from './wikicite';

/* global Services */
/* global window */
/* global Zotero */

/** Class representing a citation */
class Citation {
    /**
     * Create a citation.
     * @param {Object} citation - A Citation literal.
     * @param {Zotero.Item} citation.item - The citation's target item literal.
     * @param {string} citation.item.key - The citation's target item key, if linked to
     *   an item in the library.
     * @param {Array} ocis - Array of OpenCitations OCIs.
     *   this citation.
     * @param {Zotero.Item} sourceItem - The citation's source item.
     */
    constructor(
        {
            item,
            ocis,
            zotero
        },
        // index,  // knowing the index in the citationList may be important
        sourceItem  // should the parent CitationList (with its source item and methods to save) be passed instead?
    ) {
        // Fixme: improve type checking of the citation object passed as argument
        if (!item || !ocis) {
            throw new Error('Missing item, OCIs, or Zotero key fields!');
        }

        // this.index = index;
        if (!(item instanceof Zotero.Item)) {
            if (!item.itemType) {
                // use a default item type if it was not provided in the target item literal
                // fix: move this default value out to another file or module
                item.itemType = 'journalArticle';
            }
            // Fixme: why can't I do Zotero.Item().fromJSON(item) ?
            let zoteroItem = new Zotero.Item();
            zoteroItem.fromJSON(item);
            item = zoteroItem;
        }

        this.source = sourceItem;
        this.target = new ItemWrapper(item, this.source.item.saveTx);

        this.ocis = [];
        ocis.forEach((oci) => this.addOCI(oci));

        // zotero item key the target item of this citation is linked to
        this.zotero = zotero;

        // Issue: Save and upload information about citations order
        // this.series_ordinal;
        // // crosref does provide a citation key which seems to have some ordinal information
        // // but I say to leave this out for now
    }

    addCreator(creatorType, creatorName) {
        // I may limit author types to author and editor
    }

    addOCI(oci) {
        const { citingId, citedId, idType, supplier } = OCI.parseOci(oci);

        // commented out because not really needed (yet) and was causing
        // that pids could not be cleared, because they would be refilled
        // when addOCI was invoked from the constructor
        // // if source or target items do not have pid of type idType,
        // // use the one derived from the oci provided
        // if (!this.source[idType]) this.source[idType] = citingId;
        // if (!this.target[idType]) this.target[idType] = citedId;

        // recalculate OCI and compare against OCI given
        let newOci = '';
        try {
            newOci = OCI.getOci(supplier, this.source[idType], this.target[idType]);
        } catch {
            //
        }
        let valid;
        if (oci === newOci) {
            valid = true;
        } else {
            valid = false;
        }

        // overwrite pre-existing oci of the same supplier
        if (this.getOCI(supplier)) {
            console.log('Overwritting OCI of supplier ' + supplier);
            this.removeOCI(supplier);
        }

        this.ocis.push({
            citingId: citingId,
            citedId: citedId,
            idType: idType,
            oci: oci,
            supplier: supplier,
            valid: valid
        });
    }

    /*
     * Delete citation from Wikidata
     */
    async deleteRemotely() {
        const wikidataOci = this.getOCI('wikidata')
        if (wikidataOci && wikidataOci.valid) {
            try {
                // fetch cites work statements
                const claims = await Wikidata.getCitesWorkClaims(this.source.qid);
                const pushClaims = {};
                pushClaims[this.source.qid] = claims[this.source.qid].reduce(
                    (pushClaims, claim) => {
                        // keep those which want to be deleted
                        if (claim.value === this.target.qid) {
                            // create CitesWorkClaim objects from them
                            const pushClaim = new CitesWorkClaim(claim);
                            // and update them to pending remove status
                            pushClaim.remove = true;
                            pushClaims.push(pushClaim);
                        }
                        return pushClaims;
                }, [])
                // pass them to updateCitesWorkClaims to upload changes
                await Wikidata.updateCitesWorkClaims(pushClaims);
            } catch (err) {
                // fail if citation could not be deleted remotely
                // do not fail if it couldn't be deleted because it doesn't exist
                throw err;
            }
        } else {
            // fix: better handle this. Do I have a debugger?
            // Located string in a console message?
            throw new Error('Cannot sync deletion of citation not available in Wikidata.');
        }
    }

    getOCI(supplier) {
        const ocis = this.ocis.filter((oci) => oci.supplier === supplier);
        if (ocis.length > 1) {
            throw new Error('Unexpected multiple OCIs for supplier ' + supplier);
        }
        return ocis[0];
    }

    removeOCI(supplier) {
        this.ocis = this.ocis.filter((oci) => oci.supplier !== supplier);
    }

    /**
     * Return a JSON object to save to the source item extra field.
     */
    toJSON() {
        let item = this.target.item.toJSON();
        delete item.version;
        delete item.tags;
        delete item.collections;
        delete item.relations;
        return {
            item: item,
            ocis: this.ocis.map((oci) => oci.oci),
            zotero: this.zotero
        }
    }

    sync() {
        // upload this and only this citation to wikidata
        // check if both this.sourceItem and this.item have qid
        // do not proceed if this.suppliers includes wikidata already
        // use Wikidata.getCitations(this.sourceItem) to see if it's already uploaded
        // if not, use Wikidata.addCitation(this.sourceItem.qid, this.item.qid)
        // add wikidata to this.suppliers
        // how do I save changes to sourceItem extra field now?
        // I need access to the parent CitationList
    }

    // link the citation target item to an item in the zotero library
    linkToZoteroItem() {
        // Adapted from Zotero's bindings/relatedbox.xml
        const io = {singleSelection: true, dataOut: null};
        window.openDialog(
            'chrome://zotero/content/selectItemsDialog.xul',
            '',
            'chrome,dialog=no,modal,centerscreen,resizable=yes',
            io
        );
        if (!io.dataOut || !io.dataOut.length) {
            return;
        }
        const id = io.dataOut[0];
        const item = Zotero.Items.get(id);

        if (!item) {
            return;
        }

        const key = item.key

        if (item === this.source.item) {
            Services.prompt.alert(
                null,
                "",
                "You cannot link to the citation's source item."
            );
            return;
        }

        // keys linked to by other citations of the same source item
        const linkedKeys = this.source.citations.map(
            (citation) => citation.zotero
        );

        if (linkedKeys.includes(key)) {
            Services.prompt.alert(
                null,
                "",
                "Another citation links to this item already."
            );
            return;
        }

        if (item.libraryID !== this.source.item.libraryID) {
            Services.prompt.alert(
                null,
                "",
                "You cannot link to an item in another library."
            );
            return;
        }

        this.zotero = item.key;
        this.source.saveCitations();

        if (this.source.item.addRelatedItem(item)) {
            this.source.item.saveTx({
                skipDateModifiedUpdate: true
            });
        }
        if (item.addRelatedItem(this.source.item)) {
            item.saveTx({
                skipDateModifiedUpdate: true
            });
        }
    }

    unlinkFromZoteroItem() {
        const linkedItem = Zotero.Items.getByLibraryAndKey(
            this.source.item.libraryID,
            this.zotero
        );
        if (linkedItem) {
            if (this.source.item.removeRelatedItem(linkedItem)) {
                this.source.item.saveTx({
                    skipDateModifiedUpdate: true
                });
            }
            if (linkedItem.removeRelatedItem(this.source.item)) {
                linkedItem.saveTx({
                    skipDateModifiedUpdate: true
                });
            }
        }
        this.zotero = undefined;
        this.source.saveCitations();
    }

    resolveOCI(supplier) {
        const oci = this.getOCI(supplier);
        if (oci) {
            OCI.resolve(oci.oci);
        }
    }
}

export default Citation;
