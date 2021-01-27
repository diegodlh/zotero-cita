import Citation from './citation';
import SourceItemWrapper from './sourceItemWrapper';
import OCI from './oci';
import Progress from './progress';
import Wikicite from './wikicite';
import Wikidata from './wikidata';

/* global Services */
/* global window */

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
            (item) => new SourceItemWrapper(item)
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
    static async syncItemCitationsWithWikidata(sourceItems) {
        const noQidItems = sourceItems.filter(
            (sourceItem) => !sourceItem.qid
        );
        // noQidItems.length items do not have a QID
        // would you like to try and get one for them before
        // proceeding?
        // this may be an await and the rest of the code later

        let qids = sourceItems.reduce(
            (qids, sourceItem) => {
                const qid = sourceItem.qid;
                if (qid) qids.push(sourceItem.qid);
                return qids;
            }, []
        );
        qids = [...new Set(qids)];

        const progress = new Progress('loading', 'Fetching citations...');

        let remoteCitedQidMap;
        try {
            // get a map of citingQid -> citedQids
            remoteCitedQidMap = await Wikidata.getCitations(qids);
            progress.updateLine('done', 'Citations fetched');
        } catch {
            progress.updateLine('error', 'Fetching citations failed');
            progress.close();
            return;
        }

        // local citation actions arrays
        const localAddCitations = {};  // these citations will be added locally
        const localFlagCitations = {};  // Wikidata OCI will be added to these
        const localUnflagCitations = {};  // Wikidata OCI will be removed from these
        const localDeleteCitations = {};  // these citations will be removed locally

        // remote citation actions arrays
        const remoteAddCitations = {};  // these citations will be added remotely

        //// special citation arrays
        // orphaned citations
        // citations that have a wikidata oci
        // but which are no longer available in wikidata
        const orphanedCitations = {};
        // no qid citations count
        // number of local citations for which the target item qid is unknown

        // local citation actions counters
        let localAddCitationsCount = 0;
        let localFlagCitationsCount = 0;
        let localUnflagCitationsCount = 0;
        let localDeleteCitationsCount = 0;

        // remote citation actions counters
        let remoteAddCitationsCount = 0;

        // special counters
        let orphanedCitationsCount = 0;

        // citations which already have a Wikidata OCI
        let syncedCitationsCount = 0;
        // citations for which their target item qids are unknown
        let noQidCitationsCount = 0;
        // citations with an invalid Wikidata OCI
        let invalidOciCount = 0;

        const localItemsToUpdate = new Set();
        const remoteEntitiesToUpdate = new Set();

        for (const sourceItem of sourceItems) {
            const itemId = sourceItem.item.id;

            // Initialize action arrays
            localAddCitations[itemId] = [];
            localFlagCitations[itemId] = [];
            remoteAddCitations[itemId] = [];
            orphanedCitations[itemId] = [];

            const remoteCitedQids = remoteCitedQidMap[sourceItem.qid];

            let localCitedQids = new Set();
            // first iterate over local citations
            for (const citation of sourceItem.citations) {
                const localCitedQid = citation.target.qid;
                const wikidataOci = citation.ocis.filter(
                    (oci) => oci.supplier === 'wikidata'
                )[0];
                // First check if the citation has an invalid wikidata oci.
                // These citations will be ignored (i.e., they won't be
                // unflagged nor will they be marked as orphaned).
                // No new citation will be created either for the target item
                // referred to by the oci.
                // User must fix the inconsistency first: revert the source or
                // target item qid change, or remove the citation.
                if (wikidataOci && !wikidataOci.valid) {
                    // local citation has a wikidata oci, but it is invalid
                    // i.e., it corresponds to another source or target qid
                    invalidOciCount += 1;

                    // add the invalid oci's target qid to the array of local cited qids
                    // because we don't want to create a new local citation for this
                    // target item
                    localCitedQids.add(wikidataOci.citedId);
                    continue;
                }
                if (localCitedQid) {
                    localCitedQids.add(localCitedQid);
                    if (remoteCitedQids.includes(localCitedQid)) {
                        // the citation exists in Wikidata as well
                        if (wikidataOci) {
                            // the citation already has a valid up-to-date wikidata oci
                            syncedCitationsCount += 1;
                        } else {
                            // the citation doesn't have a wikidata oci yet
                            localFlagCitations[itemId].push(localCitedQid);
                            localFlagCitationsCount += 1;
                            localItemsToUpdate.add(itemId);
                        }
                    } else {
                        // the citations does not exist in Wikidata
                        if (wikidataOci) {
                            // the citation has a valid Wikidata oci
                            // hence, it existed in Wikidata before
                            orphanedCitations[itemId].push(localCitedQid);
                            orphanedCitationsCount += 1;
                        } else {
                            // the citation doesn't have a Wikidata OCI yet
                            remoteAddCitations[itemId].push(localCitedQid);
                            remoteAddCitationsCount += 1;
                            remoteEntitiesToUpdate.add(sourceItem.item.qid);
                        }
                    }
                } else {
                    // the citation target item's qid is unknown
                    noQidCitationsCount += 1;
                }
            }
            // then iterate over remote Wikidata citations
            for (const remoteCitedQid of remoteCitedQids) {
                if (!localCitedQids.has(remoteCitedQid)) {
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
                    'wikicite.wikidata.orphaned.message', orphanedCitationsCount
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
            progress.newLine('done', 'All up to date');
            progress.close();
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
            // Fixme: this number (and the localFlagCitationsCount) is approximate,
            // because the sourceItem.addCitations() method run below may find
            // an already existing local citation for the same target item and flag
            // and flag it instead of creating a new one
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
        // local citations that will not be changed
        const unchangedCitationsCount = (
            syncedCitationsCount +
            noQidCitationsCount +
            invalidOciCount
        );
        if (unchangedCitationsCount) {
            confirmMsg += (
                '\n\n' +
                Wikicite.formatString(
                    'wikicite.wikidata.confirm.message.unchanged',
                    unchangedCitationsCount
                )
            );
            if (syncedCitationsCount) {
                confirmMsg += (
                    '\n\t' +
                    Wikicite.formatString(
                        'wikicite.wikidata.confirm.message.synced',
                        syncedCitationsCount
                    )
                );
            }
            if (noQidCitationsCount) {
                confirmMsg += (
                    '\n\t' +
                    Wikicite.formatString(
                        'wikicite.wikidata.confirm.message.noqid',
                        noQidCitationsCount
                    )
                );
            }
            if (invalidOciCount) {
                confirmMsg += (
                    '\n\t' +
                    Wikicite.formatString(
                        'wikicite.wikidata.confirm.message.invalidOci',
                        invalidOciCount
                    )
                );
            }
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
            progress.newLine('error', 'Sync cancelled');
            progress.close();
            return;
        }

        // create an array of QIDs whose metadata must be downloaded
        const downloadQids = Object.values(localAddCitations).reduce(
            (qids, citedQids) => qids.concat(citedQids)
        );

        progress.newLine('loading', 'Fetching citations metadata...');

        // Fixme: maybe keep fields supported by editor only?
        const targetItems = await Wikidata.getItems(downloadQids);
        progress.updateLine('done', 'Citations metadata fetched')

        // Wikidata.addCitations([
        //     {
        //         qid: 'Q1234',
        //         citations: [
        //             citation.item
        //         ]
        //     }
        // ])  // do not proceed if this fails

        for (const sourceItem of sourceItems) {
            const newCitations = [];
            for (const targetQid of localAddCitations[sourceItem.item.id]) {
                const targetItem = targetItems[targetQid];
                const oci = OCI.getOci('wikidata', sourceItem.qid, targetQid);
                const citation = new Citation(
                    {
                        item: targetItem,
                        ocis: [oci]
                    },
                    sourceItem
                );
                newCitations.push(citation)
            }
            sourceItem.addCitations(newCitations);
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
            progress.close();
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
    // But I may want to use Zotero.ProgressQueue to keep track of what is going on
}