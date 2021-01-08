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

    static getItemQids(items, includingCitations=false, overwrite=false) {
        const sourceItems = items.map(
            (item) => new CitationList(item)
        );
        const unique_ids = [];
        const id_mappings = {
            zotero_key: {
                source_ids: [{doi: '123'}, ],
                target_ids: {
                    0: []
                }
            }
        }
        for (const sourceItem of sourceItems) {
            // if overwrite = false, ignore items or citations
            // for which we already know the qid

            // if includingCitations=true, check citations as well
            const key = sourceItem.item.key;
            const sourceIds = []
            itemIds[key] = {
                source_ids: [],
                target_ids: {}
            }
            // as an id appears, also append it to the unique_ids sets
        }

        // return uid: qid
        // Wikidata checks all possible results (maybe more than one
        // QID has the same id, an error). Returns all
        // I'll choose lowest later
        // const gotQids = Wikicite.fetchQids(unique_ids)

        // now traverse sourceItems again and check if we got a result
        // from Wikidata.
        // Check all possible results and keep the lowest one
        // saves items
    }

    static syncItemCitationsWithWikidata(items) {
        // Fixme: consider changing name of CitationList class
        // to something more descriptive of the item. For example,
        // SourceItem, or CitingItem
        const sourceItems = items.map(
            (item) => new CitationList(item)
        );
        const noQidItems = sourceItems.filter(
            (sourceItem) => !sourceItem.qid
        );

        // noQidItems.length items do not have a QID
        // would you like to try and get one for them before
        // proceeding?
        // this may be a promise and the rest of the code is
        // run when the promise is fullfilled

        let qids = sourceItems.map(
            (sourceItem) => sourceItem.qid
        );
        qids = new Set(qids);

        // this should return an array, or a map. One entry per source
        // item, identified with its QID.
        // Within each, an array of QIDs cited by the source QID in wikidata
        const remoteCitedQids = Wikidata.getCitations(qids);
        // Make sure I don't get two citations for the same item
        // with the same QID. I have to solve this in Wikidata module

        const remoteOnlyCitations = {
            // zotero_id: qid
        };  // localAddCitations
        const bothSidesCitations = {
            // zotero_id: qid
        };  // unchangedCitations + localFlagCitations
        const localOnlyCitations = {
            // zotero_id: qid
        }; // orphanedCitations + remoteAddCitations
        const noQidCitationCount = {
            // zotero_id: number
        }

        for (const sourceItem of sourceItems) {
            const itemId = sourceItem.item.id;
            // Fixme: maybe I don't need to initilize them like this
            remoteOnlyCitations[itemId] = [];
            bothSidesCitations[itemId] = [];
            localOnlyCitations[itemId] = [];
            noQidCitationCount[itemId] = 0;

            const remoteCitedQids = remoteCitedQids[sourceItem.qid];
            let localCitedQids = new Set();
            for (const citation of sourceItem.citations) {
                const qid = Wikicite.getExtraField(
                    citation.item, 'qid'
                ).values[0]
                if (qid) {
                    localCitedQids.add(qid);
                } else {
                    noQidCitationCount[itemId] += 1;
                }
            }
            sourceItem.citations.map(
                (citation) => Wikicite.getExtraField(
                    citation.item, 'qid'
                ).values[0]
            );
            localCitedQids = new Set(localCitedQids);
            for (const remoteCitedQid of remoteCitedQids) {
                if (localCitedQids.includes(remoteCitedQid)) {
                    bothSidesCitations[itemId].push(remoteCitedQid);
                } else {
                    remoteOnlyCitations[itemId].push(remoteCitedQid);
                }
            }
            for (const localCitedQid of localCitedQids) {
                if (!remoteCitedQids.includes(localCitedQid)) {
                    localOnlyCitations[itemId].push(localCitedQid)
                }
            }
        }

        // Fixme: apart from one day implementing possible duplicates
        // here I have to check other UUIDs too (not only QID)
        // and if they overlap, send them to localFlag instead
        const localAddCitations = remotOnlyCitations;
        // Fixme: keep only does that have to be flagged
        // Include those that will be added to wikidata now
        const localFlagCitations = bothSidesCitations;
        const localUnflagCitations = {};
        const localDeleteCitations = {};
        const remoteAddCitations = {};

        // prompt user about local only citations and add them to
        // one of localUnflag, localDelete or remoteAdd citations
        // differentiate between flagged or not
        // Instead, save response in a variable = 'keep' | 'remove' | 'upload'
        // and the array is called 'orphanedCitations'

        // confirm actions
        // XX local items would be updated:
        // XX citations would be added
        // XX citations would be marked as available in Wikidata
        // XX citations would be marked as no longer available in Wikidata
        // XX citations would be removed
        // YY Wikidata entities will be updated:
        // YY citations would be added

        const downloadQids = null // concat and set values of localAddCitations

        // this should return zotero items
        const citationMetadata = Wikidata.getMetadata(downloadQids)

        Wikidata.addCitations([
            {
                qid: 'Q1234',
                citations: [
                    citation.item
                ]
            }
        ])  // do not proceed if this fails

        for (const sourceItem of sourceItems) {
            // Fixme: some time may have passed since I instantiated
            // these sourceItems. The citations could have changed locally
            // should I instantiate them again, or always on the fly
            // or maybe I should reconsider having the citations property
            // as a getter. How would this affect the React components?
            const itemKey = sourceItem.item.key;
            const sourceQid = sourceItem.item.qid;
            for (const localAddCitation of localAddCitations[itemKey]) {
                const targetQid = localAddCitation;
                const targetItem = citationMetadata[targetQid];
                const oci = calculateOCI(sourceQid, targetQid);
                // use SourceItem.addCitation to make sure
                // there never are duplicate UUIDs
                const citation = new Citation({
                    item: targetItem,
                    oci: [oci],
                    sourceItem: sourceItem
                });
                sourceItem.citations.push(citation)
            }
            for (const localFlagCitation of localFlagCitations[itemKey]) {
                const targetQid = localFlagCitation;
                const oci = calculateOCI(sourceQid, targetQid);
                const citation = sourceItem.citations.filter // get citation
                citation.oci.push(oci);
                // and replace it. I need a CitationList/SourceItem method
                // that takes a uuid (e.g., qid), locates the one citation
                // that has that qid, and adds the corresponding oci
                // there is a complementary method that removes the oci
                // SourceItem.updateOci(supplier, targetUuid)
                // SourceItem.removeOci(supplier, targetUuid)
            }
            for (const localUnflagCitation of localUnflagCitations[itemKey]) {
                ...
            }
            for (const localDeleteCitation of localDeleteCitations[itemKey]) {
                const targetQid = localRemoveCitation
                const citationIndex = sourceItem.citations.// find citation index
                SourceItem.removeCitation(citationIndex);
            }
            sourceItem.save()
        }


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