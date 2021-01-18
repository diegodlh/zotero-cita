import CitationList from './citationList';
import Wikicite from './wikicite';
import Wikidata from './wikidata';
import Citation from './citation';

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

    /**
     * Sync source item citations with Wikidata.
     * @param {Array} sourceItems - One or more source items to sync citations for.
     */
    // Fixme: what about getting CitationList/SourceItem objects directly
    // instead of Zotero items? This way, I can reuse the the SourceItems
    // instantiated by the method calling this method.
    static async syncItemCitationsWithWikidata(sourceItems) {
        // Fixme: consider changing name of CitationList class
        // to something more descriptive of the item. For example,
        // SourceItem, or CitingItem
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
        qids = [...new Set(qids)];

        const remoteCitedQidMap = await Wikidata.getCitations(qids);

        // local citation actions arrays
        const localAddCitations = {};
        const localFlagCitations = {};
        const localUnflagCitations = {};
        const localDeleteCitations = {};

        // remote citation actions arrays
        const remoteAddCitations = {};

        // special citation arrays
        const orphanedCitations = {};
        const noQidCitationsCounts = {};

        // local citation actions counters
        let localAddCitationsCount = 0;
        let localFlagCitationsCount = 0;
        let localUnflagCitationsCount = 0;
        let localDeleteCitationsCount = 0;

        // remote citation actions counters
        let remoteAddCitationsCount = 0;

        // special counters
        let orphanedCitationsCount = 0;
        let unchangedCitationsCount = 0;

        const localItemsToUpdate = new Set();
        const remoteEntitiesToUpdate = new Set();

        for (const sourceItem of sourceItems) {
            const itemId = sourceItem.sourceItem.id;

            // Initialize action arrays
            localAddCitations[itemId] = [];
            localFlagCitations[itemId] = [];
            remoteAddCitations[itemId] = [];
            orphanedCitations[itemId] = [];

            noQidCitationsCounts[itemId] = 0;

            const remoteCitedQids = remoteCitedQidMap[sourceItem.qid];

            let localCitedQids = new Set();
            for (const citation of sourceItem.citations) {
                const localCitedQid = Wikicite.getExtraField(
                    citation.item, 'qid'
                ).values[0]
                if (localCitedQid) {
                    localCitedQids.add(localCitedQid);
                    if (remoteCitedQids.includes(localCitedQid)) {
                        // Fixme: change
                        if (citation.suppliers.includes('wikidata')) {
                            unchangedCitationsCount += 1;
                        } else {
                            localFlagCitations[itemId].push(localCitedQid);
                            localFlagCitationsCount += 1;
                            localItemsToUpdate.add(itemId);
                        }
                    } else {
                        // Fixme: change
                        if (citation.suppliers.includes('wikidata')) {
                            orphanedCitations[itemId].push(localCitedQid);
                            orphanedCitationsCount += 1;
                        } else {
                            remoteAddCitations[itemId].push(localCitedQid);
                            remoteAddCitationsCount += 1;
                            remoteEntitiesToUpdate.add(sourceItem.sourceItem.qid);
                        }
                    }
                } else {
                    noQidCitationsCounts[itemId] += 1;
                    unchangedCitationsCount += 1;
                }
            }
            for (const remoteCitedQid of remoteCitedQids) {
                if (!localCitedQids.has(remoteCitedQid)) {
                    // Fixme: apart from one day implementing possible duplicates
                    // here I have to check other UUIDs too (not only QID)
                    // and if they overlap, send them to localFlag instead
                    localAddCitations[itemId].push(remoteCitedQid);
                    localAddCitationsCount += 1;
                    localItemsToUpdate.add(itemId);
                }
            }
        }

        const orphanedActions = ['keep', 'remove', 'upload'];
        const orphanedActionSelection = {}
        if (orphanedCitationsCount) {
            const result = Services.prompt.select(
                window,
                Wikicite.getString('wikicite.wikidata.orphaned.title'),
                Wikicite.formatString(
                    'wikicite.wikidata.orphaned.message', orphanedCount
                ),
                orphanedActions.length,
                orphanedActions.map((orphanedAction) => Wikicite.getString(
                    'wikicite.wikidata.orphaned.action.' + orphanedAction
                )),
                orphanedActionSelection
            );
            if (!result) {
                // user cancelled
                return;
            }
            switch (orphanedActions[orphanedActionSelection.value]) {
                // Fixme
                case 'keep':
                    for (const itemId of Object.keys(orphanedCitations)) {
                        localUnflagCitations[itemId].push(...orphanedCitations[itemId]);
                    }
                    localUnflagCitationsCount += orphanedCitationsCount;
                    break;
                case 'remove':
                    for (const itemId of Object.keys(orphanedCitations)) {
                        localDeleteCitations[itemId].push(...orphanedCitations[itemId]);
                    }
                    localDeleteCitationsCount += orphanedCitationsCount;
                    break;
                case 'upload':
                    for (const itemId of Object.keys(orphanedCitations)) {
                        remoteAddCitations[itemId].push(...orphanedCitations[itemId]);
                    }
                    remoteAddCitationsCount += orphanedCitationsCount;
                    break;
            }
        }

        if (!localItemsToUpdate.size && !remoteEntitiesToUpdate.size) {
            // no local items or remote entities to update: abort
            return
        }

        let confirmMsg = Wikicite.getString(
            'wikicite.wikidata.confirm.message.header'
        );
        if (localItemsToUpdate.size > 0) {
            confirmMsg += (
                '\n\n' +
                Wikicite.formatString(
                    'wikicite.wikidata.confirm.message.localItems',
                    localItemsToUpdate.size
                ) +
                ':'
            );
            if (localAddCitationsCount > 0) {
                confirmMsg += '\n\t' + Wikicite.formatString(
                    'wikicite.wikidata.confirm.message.localAdd',
                    localAddCitationsCount
                );
            }
            if (localFlagCitationsCount) {
                confirmMsg += '\n\t' + Wikicite.formatString(
                    'wikicite.wikidata.confirm.message.localFlag',
                    localFlagCitationsCount
                );
            }
            if (localUnflagCitationsCount) {
                confirmMsg += '\n\t' + Wikicite.formatString(
                    'wikicite.wikidata.confirm.message.localUnflag',
                    localUnflagCitationsCount
                );
            }
            if (localDeleteCitationsCount) {
                confirmMsg += '\n\t' + Wikicite.formatString(
                    'wikicite.wikidata.confirm.message.localDelete',
                    localDeleteCitationsCount
                );
            }
        }
        if (remoteEntitiesToUpdate.size > 0) {
            confirmMsg += (
                '\n\n' +
                Wikicite.formatString(
                    'wikicite.wikidata.confirm.message.remoteEntities',
                    remoteEntitiesToUpdate.size
                ) +
                ':'
            );
            if (remoteAddCitationsCount > 0) {
                confirmMsg += '\n\t' + Wikicite.formatString(
                    'wikicite.wikidata.confirm.message.remoteAdd',
                    remoteAddCitationsCount
                );
            }
        }
        if (unchangedCitationsCount) {
            confirmMsg += '\n\n' + Wikicite.formatString(
                'wikicite.wikidata.confirm.message.unchanged',
                [
                    unchangedCitationsCount,
                    Objects.values(noQidCitationsCounts).reduce(
                        (sum, noQidCitationsCount) => sum + noQidCitationsCount,
                        0
                    )
                ]
            );
        }
        confirmMsg += '\n\n' + Wikicite.getString(
            'wikicite.wikidata.confirm.message.footer'
        );
        const confirmed = Services.prompt.confirm(
            window,
            Wikicite.getString('wikicite.wikidata.confirm.title'),
            confirmMsg,
        )

        if (!confirmed) {
            // user cancelled
            return;
        }

        const downloadQids = Object.values(localAddCitations).reduce(
            (acc, curr) => acc.concat(curr), []
        )

        // this should return zotero items
        const targetItems = await Wikidata.getItems(downloadQids);

        // Wikidata.addCitations([
        //     {
        //         qid: 'Q1234',
        //         citations: [
        //             citation.item
        //         ]
        //     }
        // ])  // do not proceed if this fails

        for (const sourceItem of sourceItems) {
            // Fixme: some time may have passed since I instantiated
            // these sourceItems. The citations could have changed locally
            // should I instantiate them again, or always on the fly
            // or maybe I should reconsider having the citations property
            // as a getter. How would this affect the React components?
            const itemId = sourceItem.sourceItem.id;
            const sourceQid = sourceItem.sourceItem.qid;
            for (const localAddCitation of localAddCitations[itemId]) {
                const targetQid = localAddCitation;
                const targetItem = targetItems[targetQid];
                // const oci = calculateOCI(sourceQid, targetQid);
                // use SourceItem.addCitation to make sure
                // there never are duplicate UUIDs
                const citation = new Citation(
                    {
                        item: targetItem,
                        suppliers: ['wikidata'] //oci: [oci]
                    },
                    sourceItem
                );
                sourceItem.add(citation)
            }
            // for (const localFlagCitation of localFlagCitations[itemKey]) {
            //     const targetQid = localFlagCitation;
            //     const oci = calculateOCI(sourceQid, targetQid);
            //     const citation = sourceItem.citations.filter // get citation
            //     citation.oci.push(oci);
            //     // and replace it. I need a CitationList/SourceItem method
            //     // that takes a uuid (e.g., qid), locates the one citation
            //     // that has that qid, and adds the corresponding oci
            //     // there is a complementary method that removes the oci
            //     // SourceItem.updateOci(supplier, targetUuid)
            //     // SourceItem.removeOci(supplier, targetUuid)
            // }
            // for (const localUnflagCitation of localUnflagCitations[itemKey]) {
            //     console.log(`Zotero item ${itemKey}: removing Wikidata OCI for target item with QID ${localUnflagCitation}.`)
            // }
            // for (const localDeleteCitation of localDeleteCitations[itemKey]) {
            //     const targetQid = localRemoveCitation
            //     const citationIndex = sourceItem.citations.// find citation index
            //     SourceItem.removeCitation(citationIndex);
            // }
            sourceItem.save()
        }


        // // check which of the items provided have QID
        // // in principle only citations with target QID should be uploaded
        // // alternatively, Wikidata.getQID may be called for each target item
        // // to try and get QID, but I think this may be too much for batch?
        // // maybe it could be a tick in a confirmation dialog
        // // "try to get QID for citation targets before syncing to wikidata"
        // // do this only for items with qid
        // let { values: sourceQIDs } = items.map(item => Wikicite.getExtraField(item, 'qid'));
        // let remoteCitations = this.getCitations(sourceQIDs[0]);
        // for (let item of items) {
        //     // get remote citations for this specific item from remoteCitations
        //     let localCitations = new CitationList(item);
        //     // check which of the local citations is not a remote citation too
        //     // identified by qid-to-qid links
        //     // use this.addCitations() to send citations to Wikidata
        //     // update the localCitations citations to include suppliers = wikidata, and save

        //     // also, there will be some local citations with wikidata in the suppliers,
        //     // but this citation may be missing in remote citations
        //     // this means it was deleted from Wikidata.
        //     // ask user if they want to remove them locally too
        //     // maybe return a list of these at the end, and have the caller of this method
        //     // ask the user and delete them if user says yes
        //     // like one by one, or selection, or yes/yes to all, etc

        //     // now of the remote citations that are not available locally,
        //     // use some CitationList method to check if a similar citation
        //     // exists already
        // }
        // let localCitations = items.map(item => CitationList(item));
    }

    // maybe i don't need a batch method for getting from PDF
    // because I don't think I want (or even can) call with multiple pdfs
}