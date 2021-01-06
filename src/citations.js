import CitationList from './citationList';
import Wikicite from './wikicite';

// Fixme: Consider moving these as static methods of the CitationList class
// These are methods used to run batch actions on multiple items, where
// a third party is called and it may be more efficient to call it once, instead
// of once per item. For example, if I want to fetch citations for several
// items with QID, it would be more efficient to call Wikidata once, than to
// call it for each item.
export default class {
    static getFromCrossref(itemIDs) {
        // check which of the items provided have DOI
        // the zotero-citationcounts already calls crossref for citations. Check it
    }

    static getFromWikidata(itemIDs, getQIDs) {
        // check which of the items provided have QID
        // try to get QID if not available? maybe with an additional parameter?
    }

    static syncWithWikidata(itemIDs) {
        // check which of the items provided have QID
        // in principle only citations with target QID should be uploaded
        // alternatively, Wikidata.getQID may be called for each target item
        // to try and get QID, but I think this may be too much for batch?
        // maybe it could be a tick in a confirmation dialog
        // "try to get QID for citation targets before syncing to wikidata"
        // do this only for items with qid
        let { values: sourceQIDs } = items.map(item => Wikicite.getExtraField(item, 'qid'));
        let remoteCitations = this.getCitations(sourceQIDs[0]);
        for (let item of items) {
            // get remote citations for this specific item from remoteCitations
            let localCitations = new CitationList(item);
            // check which of the local citations is not a remote citation too
            // identified by qid-to-qid links
            // use this.addCitations() to send citations to Wikidata
            // update the localCitations citations to include suppliers = wikidata, and save

            // also, there will be some local citations with wikidata in the suppliers,
            // but this citation may be missing in remote citations
            // this means it was deleted from Wikidata.
            // ask user if they want to remove them locally too
            // maybe return a list of these at the end, and have the caller of this method
            // ask the user and delete them if user says yes
            // like one by one, or selection, or yes/yes to all, etc

            // now of the remote citations that are not available locally,
            // use some CitationList method to check if a similar citation
            // exists already
        }
        let localCitations = items.map(item => CitationList(item));
    }

    // maybe i don't need a batch method for getting from PDF
    // because I don't think I want (or even can) call with multiple pdfs
}