import Citation from './citation';
import Wikicite from './wikicite';
import Wikidata from './wikidata';
// import { getExtraField } from './wikicite';

class CitationList {
    // When I thought of this originally, I wasn't giving the source item to the citation creator
    // but then I understood it made sense I passed some reference to the source object
    // given that the citation is a link between two objects (according to the OC model)
    // so check if any methods here make sense to be moved to the Citation class instead

    constructor(item) {
        // Constructs a Citation List by harvesting all Citation elements in
        // an item's extra field value.
        // const t0 = performance.now();
        this.sourceItem = item; // this is a reference to the source item, the parent of the citation list
        let rawCitations = Wikicite.getExtraField(this.sourceItem, 'citation').values;
        // Fixme: make sure the citation is formatted appropriately!
        const corruptCitations = [];
        this.citations = rawCitations.reduce((citations, rawCitation, index) => {
            try {
                const citation = new Citation(JSON.parse(rawCitation), this.sourceItem);
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
        if (corruptCitations.length) {
            // if corrupt citations were found
            // append to any previous corrupt citations
            const prevCorruptCitations = Wikicite.getExtraField(item, 'corrupt-citation').values;
            const newCorruptCitations = prevCorruptCitations.concat(corruptCitations);
            // update the corrupt-citation extra field
            Wikicite.setExtraField(this.sourceItem, 'corrupt-citation', newCorruptCitations);
            // and save healthy citations to the source item
            this.save();
        }
        // const t1 = performance.now();
        // this.updateCitationLabels();
        // const t2 = performance.now();
        // console.log(`Instantiating citation list took ${t2-t0}ms, ${t2-t1} of which where needed to update citation labels`);
    }

    // Alternatively, do not instantiate source item citations upon construction of the CitatioList,
    // but rather "get" them from the source item each time they are requested.
    // Pro: the CitationList does not become obsolete when the source item is updated
    // Con: if citations are requested too frequently, it may be costly
    // Or, I may also have a updateCitations method that would update the this.citations property
    // Maybe I could be listening to changes on the item and run the update then

    // get citations() {
    //     console.log('Getting citations from source item');
    //     const rawCitations = Wikicite.getExtrafield(this.sourceItem.getField('extra'), 'citation').values;
    //     const citations = rawCitations.reduce((citations, rawCitation) => {
    //       const citation = new Citation(JSON.parse(rawCitation), this.sourceItem);
    //       if (citation) {
    //         citations.push(citation)
    //       }
    //       return citations;
    //     }, []);
    //     return citations;
    // }

    // set citations(citations) {

    // }

    // get source.doi() {
    //     return this.sourceItem.getField('DOI');
    // }

    // set sourceDOI(doi) {
    //     this.sourceItem.setField('DOI', doi);
    //     this.sourceItem.saveTx();
    // }

    // get sourceOCC() {
    //     return Wikicite.getExtraField(this.sourceItem, 'occ').values[0];
    // }

    // set sourceOCC(occ) {
    //     Wikicite.setExtraField(this.sourceItem, 'occ', occ);
    //     this.sourceItem.saveTx();
    // }

    // get sourceQID() {
    //     return Wikicite.getExtraField(this.sourceItem, 'qid').values[0];
    // }

    // set sourceQID(qid) {
    //     Wikicite.setExtraField(this.sourceItem, 'qid', qid);
    //     this.sourceItem.saveTx();
    // }

    openEditor(citation) { // always provide a citation (maybe an empty one)
        // return a promise fullfilled or rejected when the editor is closed/saved
        // the fullfilled promise resolves to a citation object, of course

        // maybe I call add from here, not the other way round
        // so I can use the add method in automatic batch processes too

        // called from the CitationList object, I can know in the editor
        // if I'm adding a citation which already exists for the source item
    }

    /**
     Save citations to source item.
     */
    save() {
        // replacer function for JSON.stringify
        function replacer(key, value) {
            if (!value) {
                // do not include property if value is null or undefined
                return undefined;
            }
            return value;
        }
        const citations = this.citations.map(
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
        Wikicite.setExtraField(this.sourceItem, 'citation', citations);
        // Fixme: Do I need an await for saveTx, here and anywhere else used?
        this.sourceItem.saveTx();
    }

    async new() {
        let citation = new Citation({item: {itemType: 'journalArticle'}, suppliers: []}, this.sourceItem);
        let newCitation = await this.openEditor(citation);
        // if this.source.qid && newCitation.item.qid, offer to sync to Wikidata?
        if (this.add(newCitation)) {
            this.save();
        }
    }

    add(citation) {
        // before adding a citation to the CitationList, make sure
        // there isn't another citation for the same target
        // this is not checked for editing a citation, because that can be
        // done with the editor only, and the editor will check himself
        this.citations.push(citation);
        // this.updateCitationLabels();  //deprecated
        // return if successful (index of new citation?)
    }

    // edit(index, citation) {
    //     this.citations[index] = citation;
    //     this.updateCitationLabels();
    // }

    async delete(index, sync) {
        if (sync) {
            let citation = this.citations[index];
            if (citation.suppliers.includes('wikidata')) {
                await Wikidata.deleteCitations([[this.sourceItem.qid, citation.qid]]);
                // handle result and fail if citation could not be deleted remotely
                // do not fail if it couldn't be deleted because it doesn't exist
            } else {
                // fix: better handle this. Do I have a debugger?
                // Located string in a console message?
                console.error('Cannot sync deletion of citation not available in Wikidata.')
                return
            }
        }
        this.citations.splice(index, 1);
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
            const doi = citation.item.getField('DOI');
            const qid = Wikicite.getExtraField(citation.item, 'qid').values[0];
            const occ = Wikicite.getExtraField(citation.item, 'occ').values[0];
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
        Wikidata.syncCitations(this.sourceItem);
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
        alert('Getting citations from Wikidata not yet supported');
        // Alternatively, do this for the citationIndex provided
        // fail if no QID for itemID
        // call the Wikidata api
        // call this.add multiple times
        // do something similar than crossref to check if citation retrieved already exists

        // offer to automatically link to zotero items
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

export default CitationList;
