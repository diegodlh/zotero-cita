import Citations from './citations';
import Citation from './citation';
import ItemWrapper from './itemWrapper';
import Wikicite from './wikicite';
import Wikidata from './wikidata';
// import { getExtraField } from './wikicite';

/* global Zotero */

class SourceItemWrapper extends ItemWrapper {
    // When I thought of this originally, I wasn't giving the source item to the citation creator
    // but then I understood it made sense I passed some reference to the source object
    // given that the citation is a link between two objects (according to the OC model)
    // so check if any methods here make sense to be moved to the Citation class instead

    constructor(item) {
        super(item, item.saveTx.bind(item));
        this._citations = [];
        this._batch = false;
        this.updateCitations(false);
    }

    get citations() {
        return this._citations;
    }

    set citations(citations) {
        const t0 = performance.now()
        // replacer function for JSON.stringify
        function replacer(key, value) {
            if (!value) {
                // do not include property if value is null or undefined
                return undefined;
            }
            return value;
        }
        const jsonCitations = citations.map(
            (citation) => {
                let json = JSON.stringify(
                    citation,
                    replacer,
                    1  // insert 1 whitespace into the output JSON
                );
                json = json.replace(/^ +/gm, " "); // remove all but the first space for each line
                json = json.replace(/\n/g, ""); // remove line-breaks
                return json;
            }
        );
        Wikicite.setExtraField(this.item, 'citation', jsonCitations);
        this.saveHandler();
        this._citations = citations;
        console.log(`Saving citations to source item took ${performance.now() - t0}`);
    }

    get corruptCitations() {
        const t0 = performance.now();
        const corruptCitations = Wikicite.getExtraField(this.item, 'corrupt-citation').values;
        console.log(`Getting corrupt citations from source item took ${performance.now() - t0}`)
        return corruptCitations;
    }

    set corruptCitations(corruptCitations) {
        const t0 = performance.now()
        Wikicite.setExtraField(this.item, 'corrupt-citation', corruptCitations);
        this.saveHandler();
        console.log(`Saving corrupt citations to source item took ${performance.now() - t0}`)
    }

    updateCitations(compare=true) {
        // Constructs a Citation List by harvesting all Citation elements in
        // an item's extra field value.
        const t0 = performance.now();
        let rawCitations = Wikicite.getExtraField(this.item, 'citation').values;
        const corruptCitations = [];
        const citations = rawCitations.reduce((citations, rawCitation, index) => {
            try {
                const citation = new Citation(JSON.parse(rawCitation), this);
                if (citation) {
                    citations.push(citation)
                }
            } catch {
                // if citation can't be parsed, append it to the corrupt citations array
                corruptCitations.push(rawCitation);
                console.log(`Citation #${index} is corrupt`);
            }
            return citations;
        }, []);
        if (compare) {
            // Fixme: consider running further checks
            if (this._citations.length !== citations.length) {
                console.log('Number of citations changed')
            }
        }
        this._citations = citations;
        if (corruptCitations.length) {
            this.saveCitations();
            this.corruptCitations = this.corruptCitations.concat(corruptCitations);
        }
        console.log(`Getting citations from source item took ${performance.now() - t0}`)
    }

    saveCitations() {
        this.citations = this._citations;
    }

    /* Disble automatic citation update and saving for batch editing
     *
     */
    startBatch() {
        // update citations before beginning
        this.updateCitations();
        this._batch = true;
    }

    /*
     * Re-enable automatic citation update and saving after batch editing
     */
    endBatch() {
        this.saveCitations();
        this._batch = false;
    }

    openEditor(citation) { // always provide a citation (maybe an empty one)
        // return a promise fullfilled or rejected when the editor is closed/saved
        // the fullfilled promise resolves to a citation object, of course

        // maybe I call add from here, not the other way round
        // so I can use the add method in automatic batch processes too

        // called from the CitationList object, I can know in the editor
        // if I'm adding a citation which already exists for the source item
    }

    // Fixme: add "citation" to the name of all these methods below
    // or create a separate "citation" namespace

    async new() {
        let citation = new Citation({item: {itemType: 'journalArticle'}, ocis: []}, this);
        let newCitation = await this.openEditor(citation);
        // if this.source.qid && newCitation.item.qid, offer to sync to Wikidata?
        if (this.add(newCitation)) {
            this.save();
        }
    }

    /*
     * Return citations matching the id provided.
     * @param {String} id - ID must be matched.
     * @param {String} idType - One of: index, doi, isbn, occ, qid
     * @return {Array} citations - Array of matching citations.
     */
    getCitations(id, idType) {
        if (!this._batch) this.updateCitations();
        const citations = [];
        const indices = [];
        if (idType === 'index') {
            citations.push(this.citations[id]);
        } else {
            this.citations.forEach((citation, index) => {
                if (citation.target[idType] === id) {
                    citations.push(citation);
                    indices.push(index);
                }
            });
        }
        return {
            citations,
            indices
        }
    }

    /*
     * @param {Boolean} batch - Do not update or save citations at the beginning and at the end.
     */
    addCitations(citations, batch=false) {
        // Fixme: apart from one day implementing possible duplicates
        // here I have to check other UUIDs too (not only QID)
        // and if they overlap, add the new OCIs provided only
        // Issue #25

        // this is not checked for editing a citation, because that can be
        // done with the editor only, and the editor will check himself
        if (!this._batch) this.updateCitations();
        this._citations = this._citations.concat(citations);
        if (!this._batch) this.saveCitations();
        // this.updateCitationLabels();  //deprecated
        // return if successful (index of new citation?)

        // also check if we can link to an item in the Zotero library
    }

    // edit(index, citation) {
    //     this.citations[index] = citation;
    //     this.updateCitationLabels();
    // }

    async deleteCitation(index, sync) {
        if (!this._batch) this.updateCitations();
        if (sync) {
            let citation = this.citations[index];
            const wikidataOci = citation.ocis.filter((oci) => oci.supplier === 'wikidata')[0]
            if (wikidataOci && wikidataOci.valid) {
                const progressWin = new Zotero.ProgressWindow({ closeOnClick: false });
                let progress;
                progressWin.changeHeadline(
                    'Wikicite'
                );
                progressWin.show();
                progress = new progressWin.ItemProgress(
                    'chrome://zotero/skin/arrow_refresh.png',
                    'Deleting citation from Wikidata...'
                );
                progress.setProgress(100);
                await Wikidata.deleteCitations([[this.qid, citation.target.qid]]);
                progress.setError();
                progress.setText('Deleting citations from Wikidata not yet supported');
                progressWin.startCloseTimer(3000);
                // handle result and fail if citation could not be deleted remotely
                // do not fail if it couldn't be deleted because it doesn't exist
            } else {
                // fix: better handle this. Do I have a debugger?
                // Located string in a console message?
                console.error('Cannot sync deletion of citation not available in Wikidata.')
                return
            }
        }
        this._citations.splice(index, 1);
        if (!this._batch) this.saveCitations();
        // this.updateCitationLabels();  //deprecated
    }

    /**
     Returns lists of UUIDs already in use by citations in the list.
     @param {number} [skip] - Citation index to be ignored.
     @returns {object} usedUUIDs - Lists of used UUIDs.
     */
    getUsedUUIDs(skip=undefined) {
        const usedUUIDs = {
            doi: [],
            qid: [],
            occ: []
        };
        this.citations.forEach((citation, i) => {
            if (skip === i) {
                return;
            }
            const doi = citation.target.doi;
            const qid = citation.target.qid;
            const occ = citation.target.occ;
            if (doi) {
                usedUUIDs.doi.push(doi);
            }
            if (qid) {
                usedUUIDs.qid.push(qid);
            }
            if (occ) {
                usedUUIDs.occ.push(occ);
            }
        });
        return usedUUIDs;
    }

    // updateCitationLabels() {
    //     const items = this.citations.map((citation) => citation.item);
    //     // Wikicite.getItemLabels expects items to have a libraryID!
    //     const labels = Wikicite.getItemLabels(items);
    //     this.citations.forEach((citation, index) => {
    //         citation.shortLabel = labels.short[index];
    //         citation.longLabel = labels.long[index];
    //     });
    // }

    sync() {
        // I think it is too trivial to have one Class method
        // be careful this method will not update this instance of CitationList
        // because it creates its own instances for each item provided
        Wikidata.syncCitations(this.item);
    }

    // Fixme: maybe the methods below may take an optional index number
    // if provided, sync to wikidata, export to croci, etc, only for that citation
    // if not, do it for all

    getFromCrossref() {
        alert('Getting citations from Crossref not yet supported');
        // fail if item doesn't have a DOI specified
        // In general I would say to try and get DOI with another plugin if not available locally
        // call the crossref api
        // the zotero-citationcounts already calls crossref for citations. Check it
        // call this.add multiple times, or provide an aray
        // if citation retrieved has doi, check if citation already exists locally
        // if yes, set providers.crossref to true
        // decide whether to ignore citations retrieved without doi
        // or if I will check if they exist already using other fields (title, etc)

        // offer to automatically get QID from wikidata for target items
        // using Wikidata.getQID(items)

        // offer to automatically link to zotero items
    }

    getFromOcc() {
        // What does getting from OpenCitations mean anyway?
        // Will it get it from all indices? Or only for items in OCC?
        // What about CROCI? I need DOI to get it from them,
        // But they may not be available from crossref
        // Maybe add Get from CROCI? Should I add get from Dryad too?
        alert('Getting citations from OpenCitations Corpus not yet supported');
        //
    }

    syncWithWikidata(citationIndex) {
        if (citationIndex !== undefined) {
            // Alternatively, do this for the citationIndex provided
            alert('Syncing individual citations with Wikidata not yet supported');
        } else {
            Citations.syncItemCitationsWithWikidata([this]);
        }
        // fail if no QID for itemID
        // call the Wikidata api
        // call this.add multiple times
        // do something similar than crossref to check if citation retrieved already exists

        // offer to automatically link to zotero items: this should be handled by the
        // this.addCitation method
    }

    getFromPDF(method, fetchDOIs, fetchQIDs) {
        alert('Extracting citations from file attachments not yet supported.');
        // fail if no PDF attachments found
        // either check preferences here or get them from method parameter
        // to know what method to use (GROBID, the other, url, etc)
        // here too, check for already existing citations
        // for reasons like this it may be useful to have a CitationList object

        // do I want to offer getting DOI too? Do I get this from
        // wikidata? But didn't I say in principle i would only
        // call wikidata for items with UID?
        // also offer to get QID from Wikidata for target items found
        // using wikidata.getQID(items)

        // offer to automatically link to zotero items
    }

    getFromBibTeX() {
        alert('Getting citations from a BibTeX file not yet supported');
    }

    exportToBibTeX(citationIndex) {
        alert('Exporting citations to a BibTeX file not yet supported');
    }

    exportToCroci(citationIndex) {
        alert('Exporting to CROCI not yet supported.');
    }
}

export default SourceItemWrapper;
