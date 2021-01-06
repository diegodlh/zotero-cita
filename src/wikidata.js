export default class {
    static getQID(items, approximate, getCitations=true) {
        // maybe it's better to provide items instead of itemIDs
        // in case I want to use this for targetItems (which don't
        // have a zotero item id)

        // get QID for item (if not available already)
        // batch call or multiple calls to Wikidata api?
        
        // in principle maybe just items with DOI
        // later, maybe with title too
        // if no DOI: "Fetching QID for items without DOI not yet supported"
        // "Please, fill in the DOI field, or enter the QID manually".

        // I may have to show confirmation dialogs for user to confirm
        // but maybe this is intrusive for automatic runs (install, or new item)
        // maybe additional option too?
        // approximate parameter to use fields other than UIDs

        // can I ask for cites work properties at the same time? maybe with getCitations boolean parameter?
        // or have separate call later?
        // handle offer create new one if not found
        // maybe just send them to the webpage, idk
        // call setExtraField for each of them to set QID
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

    static getCitations(sourceQID) {
        // return an array of citations, or map (one per source QID requested)
    }

    static addCitations(sourceQID, targetQID) {
        // Is there a lenght limit in calls to Wikidata API?
        // I need wikidata-js here
        // I can provide an array of (sourceQID, targetQID)s for batch operations
        // returns a promise

        // for each sourceQID, get current citations from wikidata
        // for each targetQID, ignore those in wikidata already
        // add remaining citations
    }

    static deleteCitations(sourceQID, targetQID) {
        // I can provide an array of (sourceQID, targetQID)s for batch operations
        // returns a promise
    }
}
