import Wikicite, { debug } from './wikicite';
import Citation from './citation';
import Citations from './citations';
import Crossref from './crossref';
import Extraction from './extract';
import ItemWrapper from './itemWrapper';
import Matcher from './matcher';
import OpenCitations from './opencitations';
import Progress from './progress';
// import { getExtraField } from './wikicite';

// Fixme: define this in the preferences
const SAVE_TO = 'note'; // extra

/* global Components */
/* global DOMParser */
/* global Services */
/* global Zotero */
/* global performance */
/* global window */

class SourceItemWrapper extends ItemWrapper {
    // When I thought of this originally, I wasn't giving the source item to the citation creator
    // but then I understood it made sense I passed some reference to the source object
    // given that the citation is a link between two objects (according to the OC model)
    // so check if any methods here make sense to be moved to the Citation class instead

    constructor(item) {
        super(item, item.saveTx.bind(item));
        this._citations = [];
        this._batch = false;
        this.newRelations = false;  // Whether new item relations have been queued
        this.loadCitations(false);
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
        if (SAVE_TO === 'extra') {
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
        } else if (SAVE_TO === 'note') {
            let note = Wikicite.getCitationsNote(this.item);
            if (!citations.length && note) {
                note.eraseTx();
                return;
            }
            if (!note) {
                note = new Zotero.Item('note');
                note.libraryID = this.item.libraryID;
                note.parentKey = this.item.key;
            }
            const jsonCitations = JSON.stringify(citations, replacer, 2);
            note.setNote(
                '<h1>Citations</h1>\n' +
                '<p>Do not edit this note manually!</p>' +
                `<pre>${jsonCitations}</pre>`
            );
            note.saveTx();
        }
        this._citations = citations;
        debug(`Saving citations to source item took ${performance.now() - t0}`);
    }

    get corruptCitations() {
        const t0 = performance.now();
        const corruptCitations = Wikicite.getExtraField(this.item, 'corrupt-citation').values;
        debug(`Getting corrupt citations from source item took ${performance.now() - t0}`)
        return corruptCitations;
    }

    set corruptCitations(corruptCitations) {
        const t0 = performance.now()
        Wikicite.setExtraField(this.item, 'corrupt-citation', corruptCitations);
        this.saveHandler();
        debug(`Saving corrupt citations to source item took ${performance.now() - t0}`)
    }

    /**
     * Automatically link citations with Zotero items
     * @param {Object} [matcher] Initialized Matcher object for batch operations
     * @param {Boolean} [noReload] Do not reload citations before automatic linking
     */
    async autoLinkCitations(matcher, noReload=false) {
        let progress;
        if (!matcher) {
            matcher = new Matcher(this.item.libraryID);
            progress = new Progress(
                'loading',
                Wikicite.getString('wikicite.source-item.auto-link.progress.loading')
            );
            await matcher.init();
        }
        this.startBatch(noReload);
        let newLinks = false;
        for (const citation of this._citations) {
            // skip citations already linked
            if (citation.target.key) continue;
            const matches = matcher.findMatches(citation.target.item);
            if (matches.length) {
                // if multiple matches, use first one
                const item = Zotero.Items.get(matches[0]);
                citation.linkToZoteroItem(item);
                newLinks = true;
            }
        }
        this.endBatch(!newLinks);
        if (progress) {
                progress.updateLine(
                'done',
                Wikicite.getString('wikicite.source-item.auto-link.progress.done')
            )
            progress.close();
        }
    }

    /**
     * Constructs a Citation List by harvesting all Citation elements
     * in an item's extra field value.
     */
    loadCitations(compare=true) {
        if (this.batch) return;
        const t0 = performance.now();
        const citations = [];
        const corruptCitations = [];
        if (SAVE_TO === 'extra') {
            const rawCitations = Wikicite.getExtraField(this.item, 'citation').values;
            rawCitations.forEach((rawCitation, index) => {
                try {
                    const citation = new Citation(JSON.parse(rawCitation), this);
                    if (citation) {
                        citations.push(citation)
                    }
                } catch {
                    // if citation can't be parsed, append it to the corrupt citations array
                    corruptCitations.push(rawCitation);
                    debug(`Citation #${index} is corrupt`);
                }
            });
        } else if (SAVE_TO === 'note') {
            const note = Wikicite.getCitationsNote(this.item);
            if (note) {
                let parser;
                try {
                    parser = new DOMParser();
                } catch {
                    // Workaround fix Pubpeer compatibility issue #41
                    parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
                        .createInstance(Components.interfaces.nsIDOMParser);
                }
                const doc = parser.parseFromString(
                    note.getNote(), 'text/html'
                );
                const rawCitations = JSON.parse(
                    doc.getElementsByTagName('pre')[0].textContent
                );
                // Fixme: Creating Citation objects takes most of the time
                citations.push(
                    ...rawCitations.map(
                        (rawCitation) => new Citation(rawCitation, this)
                    )
                );
                // const items = await Promise.all(rawCitations.map((rawCitation) => {
                //     return new Promise((resolve) => {
                //         const zoteroItem = new Zotero.Item();
                //         const jsonItem = rawCitation.item;
                //         zoteroItem.fromJSON(jsonItem);
                //         resolve(zoteroItem);
                //     });
                // }))
                // rawCitations.forEach((rawCitation, index) => {
                //     rawCitations[index].item = items[index]
                // })

                // Fixme: support corrupt note citations
            }
        }
        if (compare) {
            // Fixme: consider running further checks
            if (this._citations.length !== citations.length) {
                debug('Number of citations changed')
            }
        }
        this._citations = citations;
        if (corruptCitations.length) {
            this.citations = this._citations;
            this.corruptCitations = this.corruptCitations.concat(corruptCitations);
        }
        debug(`Getting citations from source item took ${performance.now() - t0}`)
    }

    saveCitations() {
        if (this._batch) return;
        this.citations = this._citations;
        if (this.newRelations) {
            debug('Saving new item relations to source item');
            this.item.saveTx({
                skipDateModifiedUpdate: true
            });
            this.newRelations = false;
        }
    }

    /**
     * Disble automatic citation update and saving for batch editing
     * @param {Boolean} [noReload] Do not reload citations automatically
     */
    startBatch(noReload=false) {
        // update citations before beginning
        if (!noReload) this.loadCitations();
        this._batch = true;
    }

    /*
     * Re-enable automatic citation update and saving after batch editing
     * @param {Boolean} [noSave] Do not save citations automatically
     */
    endBatch(noSave=false) {
        this._batch = false;
        if (!noSave) this.saveCitations();
    }

    // async new() {
    //     let citation = new Citation({item: {itemType: 'journalArticle'}, ocis: []}, this);
    //     let newCitation = await this.openEditor(citation);
    //     // if this.source.qid && newCitation.item.qid, offer to sync to Wikidata?
    //     if (this.add(newCitation)) {
    //         this.save();
    //     }
    // }

    /*
     * Return citations matching the id provided.
     * @param {String} id - ID must be matched.
     * @param {String} idType - One of: index, doi, isbn, occ, qid
     * @return {Array} citations - Array of matching citations.
     */
    getCitations(id, idType) {
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
    addCitations(citations) {
        // Fixme: apart from one day implementing possible duplicates
        // here I have to check other UUIDs too (not only QID)
        // and if they overlap, add the new OCIs provided only
        // Issue #25

        // this is not checked for editing a citation, because that can be
        // done with the editor only, and the editor will check himself

        if (!Array.isArray(citations)) citations = [citations];
        if (citations.length) {
            this.loadCitations();
            this._citations = this._citations.concat(citations);
            this.saveCitations();
        }
        // this.updateCitationLabels();  //deprecated
        // return if successful (index of new citation?)

        // also check if we can link to an item in the Zotero library
    }

    // edit(index, citation) {
    //     this.citations[index] = citation;
    //     this.updateCitationLabels();
    // }

    async deleteCitation(index, sync) {
        this.loadCitations();
        if (sync) {
            let citation = this.citations[index];
            const progress = new Progress(
                'loading',
                Wikicite.getString(
                    'wikicite.wikidata.progress.delete.loading'
                )
            );
            let success;
            try {
                success = await citation.deleteRemotely();
            } catch {
                success = false;
            }
            if (success) {
                progress.updateLine(
                    'done',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.delete.done'
                    )
                );
            } else {
                progress.updateLine(
                    'error',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.delete.error'
                    )
                );
                return;
            }
            progress.close();
        }
        const citation = this._citations[index];
        if (citation.target.key) {
            citation.unlinkFromZoteroItem(false);
        }
        this._citations.splice(index, 1);
        this.saveCitations();
        // this.updateCitationLabels();  //deprecated
    }

    getCitedPIDs(type, options={clean: true, skipCitation: undefined}) {
        const citedPIDs = this.citations.reduce((citedPIDs, citation) => {
            if (citation !== options.skipCitation) {
                const pid = citation.target.getPID(type, options.clean);
                if (pid && !citedPIDs.includes(pid)) {
                    citedPIDs.push(pid)
                }
            }
            return citedPIDs;
        }, []);
        return citedPIDs;
    }

    checkPID(
        type,
        value,
        options={
            alert: false,
            parentWindow: null,
            skipCitation: undefined
        }
    ) {
        const cleanPID = Wikicite.cleanPID(type, value);
        let conflict = false;
        if (cleanPID) {
            const cleanCitingPID = this.getPID(type, true);
            if (cleanCitingPID === cleanPID) {
                conflict = 'citing';
            } else {
                const cleanCitedPIDs = this.getCitedPIDs(
                    type, {clean: true, skipCitation: options.skipCitation}
                );
                if (cleanCitedPIDs.includes(cleanPID)) {
                    conflict = 'cited';
                }
            }
        }
        if (conflict && options.alert) {
            Services.prompt.alert(
                options.parentWindow,
                Wikicite.getString(
                    'wikicite.source-item.check-pid.conflict'
                ),
                Wikicite.formatString(
                    'wikicite.source-item.check-pid.conflict.' + conflict,
                    [type, value]
                )
            );
        }
        return !conflict;
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
        // Wikidata.syncCitations(this.item);
    }

    // Fixme: maybe the methods below may take an optional index number
    // if provided, sync to wikidata, export to croci, etc, only for that citation
    // if not, do it for all

    getFromCrossref() {
        Crossref.getCitations();
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
        OpenCitations.getCitations();
        //
    }

    syncWithWikidata(citationIndex) {
        if (citationIndex !== undefined) {
            // Alternatively, do this for the citationIndex provided
            Services.prompt.alert(
                window,
                Wikicite.getString('wikicite.global.unsupported'),
                Wikicite.getString('wikicite.source-item.sync-single-citation.unsupported')
            );
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
        Extraction.extract();
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

    // get BibTeX from clipboard
    // - also supports other formats supported by Zotero
    // - also supports multiple items
    async getFromBibTeX() {
        var str = Zotero.Utilities.Internal.getClipboard("text/unicode");
        var translation = new Zotero.Translate.Import();
        translation.setString(str);

        const progress = new Progress(
            'loading',
            'Adding citations...'
        );
        
        try {
            var translators = await translation.getTranslators();

            if (translators.length > 0){
                // set libraryID to false so we don't save this item in the Zotero library
                var newItems = await translation.translate({libraryID: false});
        
                let citations = []
                if (newItems.length > 0){
                    newItems.forEach((item) => {
                        let newItem = new Zotero.Item(item.itemType);
                        newItem.fromJSON(item);
            
                        let citation = new Citation({item: newItem, ocis: []}, this);
                        citation.target.item = newItem;
                        citations.push(citation)
                    });
                    
                    this.addCitations(citations);
        
                    progress.updateLine(
                        'done',
                        'Added citations'
                    );

                    return;
                }
            }
            // no translators, or no new items were detected
            progress.updateLine(
                'error',
                'No citations were detected'
            );  
        }
        catch {
            progress.updateLine(
                'error',
                'Error adding citations'
            );
        }

    }

    exportToBibTeX(citationIndex) {
        if (this._citations.length) {
            this.loadCitations();
            var exporter = new Zotero_File_Exporter();

            // export all citations, or only those selected?
            var citationsToExport;
            if (citationIndex === undefined){
                citationsToExport = this._citations;
            }
            else{
                citationsToExport = [this._citations[citationIndex]];
            }

            // extract the Zotero items from the citations
            var citationItems = citationsToExport.map((citation) => {
                // Note: need to set the libraryID for the exported items, otherwise we get an error on export
                citation.target.item._libraryID = this.item._libraryID;
                return citation.target.item;
            });
            
            exporter.items = citationItems;
            if(!exporter.items || !exporter.items.length) throw("no citations to export");
            
            // opens Zotero export dialog box - can select format and file location
            exporter.save();
        }
        else{
            throw("no citations to export")
        }
    }

    exportToCroci(citationIndex) {
        OpenCitations.exportCitations();
    }
}

export default SourceItemWrapper;
