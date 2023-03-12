import Wikidata, { CitesWorkClaim, cito } from './wikidata';
import Wikicite, { debug } from './wikicite';
import Citation from './citation';
import Matcher from './matcher';
import OCI from './oci';
import Progress from './progress';
import SourceItemWrapper from './sourceItemWrapper';

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
            (item) => new SourceItemWrapper(item, window.Wikicite.Prefs.get('storage'))
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
        // check which of the items provided have QID
        // in principle only citations with target QID should be uploaded
        // alternatively, Wikidata.getQID may be called for each target item
        // to try and get QID, but I think this may be too much for batch?
        // maybe it could be a tick in a confirmation dialog
        // "try to get QID for citation targets before syncing to wikidata"
        // do this only for items with qid

        const noQidItems = sourceItems.filter(
            (sourceItem) => !sourceItem.qid
        );

        if (noQidItems.length) {
            Services.prompt.alert(
                window,
                Wikicite.getString('wikicite.wikidata.ignored.title'),
                Wikicite.formatString(
                    'wikicite.wikidata.ignored.message',
                    noQidItems.length
                )
            );
        }

        sourceItems = sourceItems.filter((sourceItem) => sourceItem.qid);

        if (!sourceItems.length) {
            return;
        }

        let qids = sourceItems.reduce(
            (qids, sourceItem) => {
                const qid = sourceItem.qid;
                if (qid) qids.push(sourceItem.qid);
                return qids;
            }, []
        );
        qids = [...new Set(qids)];

        const progress = new Progress(
            'loading',
            Wikicite.getString(
                'wikicite.wikidata.progress.citations.fetch.loading'
            )
        );

        let pulledCitesWorkClaims;
        try {
            pulledCitesWorkClaims = await Wikidata.getCitesWorkClaims(qids);
            progress.updateLine(
                'done',
                Wikicite.getString(
                    'wikicite.wikidata.progress.citations.fetch.done'
                )
            );
        } catch {
            progress.updateLine(
                'error',
                Wikicite.getString(
                    'wikicite.wikidata.progress.citations.fetch.error'
                )
            );
            progress.close();
            return;
        }

        // local citation actions arrays
        const localAddCitations = {};  // these citations will be added locally
        const localFlagCitations = {};  // Wikidata OCI will be added to these
        const localUnflagCitations = {};  // Wikidata OCI will be removed from these
        const localDeleteCitations = {};  // these citations will be removed locally
        const localModifyCitations = {};  // these citations will be modified locally

        // remote citation actions arrays
        const remoteAddCitations = {};  // these citations will be added remotely
        const remoteModifyCitations = {};  // these citations will be modified remotely

        //// special citation arrays
        // orphaned citations have a Wikidata OCI but are no longer available
        // in Wikidata
        const orphanedCitations = {};

        const counters = {};
        // local citation actions counters
        counters.localAddCitations = 0;
        counters.localFlagCitations = 0;
        counters.localUnflagCitations = 0;
        counters.localDeleteCitations = 0;
        counters.localModifyCitations = 0;

        // remote citation actions counters
        counters.remoteAddCitations = 0;
        counters.remoteModifyCitations = 0;

        // special counters
        counters.orphanedCitations = 0;

        // citations which already have a Wikidata OCI
        counters.syncedCitation = 0;
        // citations for which their target item qids are unknown
        counters.noQidCitations = 0;
        // citations with an invalid Wikidata OCI
        counters.invalidOci = 0;

        const localItemsToUpdate = new Set();
        const remoteEntitiesToUpdate = new Set();

        for (const sourceItem of sourceItems) {
            const itemId = sourceItem.item.id;

            // Initialize action arrays
            localAddCitations[itemId] = [];
            localFlagCitations[itemId] = [];
            localUnflagCitations[itemId] = [];
            localDeleteCitations[itemId] = [];
            localModifyCitations[itemId] = [];
            remoteAddCitations[itemId] = [];
            remoteModifyCitations[itemId] = [];
            orphanedCitations[itemId] = [];
       
            let remoteCitations = new Set();
            remoteCitations = pulledCitesWorkClaims[sourceItem.qid].map(
                (claim) => new CitesWorkClaim(claim)
            );
            // make an array of remote citation's QIDs for comparaison
            const remoteCitedQids = pulledCitesWorkClaims[sourceItem.qid].map(
                (claim) => claim.value
            );
            
            let localCitedQids = new Set();
            let localCitations = new Set();
            // first iterate over local citations
            for (const citation of sourceItem.citations) {

                // translate the citation's intentions from text to QIDs 
                const translatedTargetIntentions = []; 
                const targetIntentions = citation.target.intentions;
                for (const targetIntention of targetIntentions) {
                    translatedTargetIntentions.push(cito[targetIntention]);
                }

                let localCitation = new CitesWorkClaim({
                    value : citation.target.qid,
                    qualifiers : {
                        P3712: translatedTargetIntentions
                    }
                });
                let remoteCitation;
                remoteCitations.forEach((citation) => {
                    if (citation.value === localCitation.value) {
                        remoteCitation = citation;
                    }
                });

                const wikidataOci = citation.getOCI('wikidata');
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
                    counters.invalidOci += 1;

                    // add the invalid oci's target qid to the array of local cited qids
                    // because we don't want to create a new local citation for this
                    // target item
                    localCitations.add(new CitesWorkClaim({ value : wikidataOci.CitedId }));
                    continue;
                }
                if (localCitation.value) {
                    localCitations.add(localCitation);
                    // save local citation's QIDs in a set for later comparaison
                    localCitedQids.add(localCitation.value);

                    if (remoteCitedQids.includes(localCitation.value)) {
                        // the citation exists in Wikidata as well
                        if (wikidataOci) {
                            // the citation already has a valid up-to-date wikidata oci
                            if (!remoteCitation.compareIntentions(localCitation)) {
                                // the local and remote citation's itentions are not the same
                                // hence, the intentions has been modified in wikidata
                                localModifyCitations[itemId].push(remoteCitation);
                                counters.localModifyCitations += 1;
                                localItemsToUpdate.add(itemId);
                            } else {
                                // the citation has not been modified in wikidata
                                counters.syncedCitations += 1;
                            }
                        } else {
                            // the citation doesn't have a wikidata oci yet
                            if (!remoteCitation.compareIntentions(localCitation)) {
                                // the local and remote citation's itentions are not the same
                                // hence, it has been modified locally by the user

                                // set the guid to update the claim
                                localCitation.id = remoteCitation.id;
                                // implement the references and qualifiers from
                                // the existing claim to not remove them on wikidata
                                localCitation.references = remoteCitation.references;
                                if (remoteCitation.qualifiers["P1545"]) {
                                    localCitation.qualifiers["P1545"] = remoteCitation.qualifiers["P1545"];
                                }

                                remoteModifyCitations[itemId].push(localCitation)
                                counters.remoteModifyCitations += 1;
                                remoteEntitiesToUpdate.add(sourceItem.qid);
                            } else {
                                // the citation has not been modified locally
                            localFlagCitations[itemId].push(localCitation);
                            counters.localFlagCitations += 1;
                            localItemsToUpdate.add(itemId);
                            }
                        }
                    } else {
                        // the citation does not exist in Wikidata
                        if (wikidataOci) {
                            // the citation has a valid Wikidata oci
                            // hence, it existed in Wikidata before
                            orphanedCitations[itemId].push(localCitation);
                            counters.orphanedCitations += 1;
                        } else {
                            // the citation doesn't have a Wikidata OCI yet
                            if (remoteAddCitations[itemId].includes(localCitation.value)) {
                                // in case of duplicate local citations
                                // do not add "cites work" statement remotely twice
                                debug(
                                    'Will not create duplicate "cites work" statement for ' +
                                    localCitation.value
                                );
                            } else {
                                remoteAddCitations[itemId].push(localCitation);
                                counters.remoteAddCitations += 1;
                                remoteEntitiesToUpdate.add(sourceItem.qid);
                            }
                        }
                    }
                } else {
                    // the citation target item's qid is unknown
                    counters.noQidCitations += 1;
                }
            }
            // then iterate over remote Wikidata citations
            for (const remoteCitation of remoteCitations) {
                if (!localCitedQids.has(remoteCitation.value)) {
                    localAddCitations[itemId].push(remoteCitation);
                    counters.localAddCitations += 1;
                    localItemsToUpdate.add(itemId);
                }
            }
        }

        // Ask the user what to do with orphaned citations
        const orphanedActions = ['keep', 'remove', 'upload'];
        const orphanedActionSelection = {}
        if (counters.orphanedCitations) {
            const result = Services.prompt.select(
                window,
                Wikicite.getString('wikicite.wikidata.orphaned.title'),
                Wikicite.formatString(
                    'wikicite.wikidata.orphaned.message', counters.orphanedCitations
                ),
                orphanedActions.length,
                orphanedActions.map((orphanedAction) => Wikicite.getString(
                    'wikicite.wikidata.orphaned.action.' + orphanedAction
                )),
                orphanedActionSelection
            );
            if (!result) {
                // user cancelled
                progress.newLine(
                    'error',
                    Wikicite.getString('wikicite.wikidata.progress.citations.cancelled')
                );
                progress.close();
                return;
            }
            switch (orphanedActions[orphanedActionSelection.value]) {
                case 'keep':
                    // keep local citation, but remove outdated Wikidata OCI
                    for (const itemId of Object.keys(orphanedCitations)) {
                        localUnflagCitations[itemId].push(...orphanedCitations[itemId]);
                        localItemsToUpdate.add(Number(itemId));
                    }
                    counters.localUnflagCitations += counters.orphanedCitations;
                    break;
                case 'remove':
                    // remove local citation because it no longer exists in Wikidata
                    for (const itemId of Object.keys(orphanedCitations)) {
                        localDeleteCitations[itemId].push(...orphanedCitations[itemId]);
                        localItemsToUpdate.add(Number(itemId));
                    }
                    counters.localDeleteCitations += counters.orphanedCitations;
                    break;
                case 'upload':
                    // keep local citation and upload to Wikidata again
                    for (const itemId of Object.keys(orphanedCitations)) {
                        remoteAddCitations[itemId].push(...orphanedCitations[itemId]);
                        const sourceQid = sourceItems.filter(
                            (sourceItem) => sourceItem.item.id === Number(itemId)
                        )[0].qid;
                        remoteEntitiesToUpdate.add(sourceQid);
                    }
                    counters.remoteAddCitations += counters.orphanedCitations;
                    break;
            }
        }

        if (!localItemsToUpdate.size && !remoteEntitiesToUpdate.size) {
            // no local items or remote entities to update: abort
            progress.newLine(
                'done',
                Wikicite.getString(
                    'wikicite.wikidata.progress.citations.uptodate'
                )
            );
            progress.close();
            return
        }

        // Show verbose confirmation message with actions to be taken
        // before proceeding.
        const confirmed = Services.prompt.confirm(
            window,
            Wikicite.getString('wikicite.wikidata.confirm.title'),
            composeConfirmation(
                localItemsToUpdate,
                remoteEntitiesToUpdate,
                counters
            )
        )

        if (!confirmed) {
            // user cancelled
            progress.newLine(
                'error',
                Wikicite.getString(
                    'wikicite.wikidata.progress.citations.cancelled'
                )
            );
            progress.close();
            return;
        }

        // keep track of citations that could not be added locally
        // because the Wikidata entity is not an instance of a class
        // mapped to a supported Zotero item type
        let unsupportedCitations = 0;

        // First, run actions that require communication with Wikidata

        // download metadata of target items of citations to be created
        let targetItems;
        if (counters.localAddCitations) {
            // create an array of QIDs whose metadata must be downloaded
            const downloadQids = [];
            for (const itemKey of Object.keys(localAddCitations)) {
                for (const citation of localAddCitations[itemKey]) {
                    downloadQids.push(citation.value);
                }
            }

            // download target items metadata
            progress.newLine(
                'loading',
                Wikicite.getString(
                    'wikicite.wikidata.progress.metadata.fetch.loading'
                )
            );
            try {
                targetItems = await Wikidata.getItems(downloadQids);
            } catch {
                progress.updateLine(
                    'error',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.metadata.fetch.error'
                    )
                );
                progress.close();
                return;
            }
            progress.updateLine(
                'done',
                Wikicite.getString(
                    'wikicite.wikidata.progress.metadata.fetch.done'
                )
            );
        }

        // cites work claims to be pushed to Wikidata
        const pushCitesWorkClaims = {};
        if (counters.remoteAddCitations || counters.remoteModifyCitations) {
            progress.updateLine(
                'loading',
                Wikicite.getString('wikicite.wikidata.progress.upload.loading')
            );

            for (const sourceItem of sourceItems) {
                if (!remoteEntitiesToUpdate.has(sourceItem.qid)) {
                    // item not in the list of items to update; skip
                    continue;
                }

                // this is a workaround to correctly format the request to the API
                if (remoteAddCitations[sourceItem.item.id].length && remoteModifyCitations[sourceItem.item.id].length) {
                    pushCitesWorkClaims[sourceItem.qid] = remoteAddCitations[sourceItem.item.id];
                    pushCitesWorkClaims[sourceItem.qid].push(remoteModifyCitations[sourceItem.item.id]);
                } else if (remoteAddCitations[sourceItem.item.id].length) {
                    pushCitesWorkClaims[sourceItem.qid] = remoteAddCitations[sourceItem.item.id];
                } else if (remoteModifyCitations[sourceItem.item.id].length) {
                    pushCitesWorkClaims[sourceItem.qid] = remoteModifyCitations[sourceItem.item.id];
                }
            }
            // Fixme: in the future, support editing cites work claims as well;
            // for example, to add references or qualifiers
            const results = await Wikidata.updateCitesWorkClaims(pushCitesWorkClaims);
            
            // After Wikidata edits have been submitted,
            // iterate through source items again,
            // to see if any of them have to be updated
            for (const sourceItem of sourceItems) {
                const itemId = sourceItem.item.id;
                if (remoteAddCitations[itemId] && results[sourceItem.qid] === 'ok') {
                    // if item had citations to upload to Wikidata
                    // and uploads where succesful
                    // flag citations immediately as available in Wikidata
                    sourceItem.startBatch();
                    for (const targetCitation of remoteAddCitations[itemId].concat(remoteModifyCitations[itemId])) {
                        const { citations } = sourceItem.getCitations(targetCitation.value, 'qid');
                        for (const citation of citations) {
                            citation.addOCI(
                                OCI.getOci('wikidata', sourceItem.qid, targetCitation.value)
                            );
                        }
                    }
                    sourceItem.endBatch();
                }
            }

            if (Object.values(results).every((result) => result === 'ok')) {
                progress.updateLine(
                    'done',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.upload.done'
                    )
                );
            } else if (Object.values(results).some((result) => result === 'cancelled')) {
                // user cancelled login for at least one of the entities to be edited
                progress.updateLine(
                    'error',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.citations.cancelled'
                    )
                );
                // if user cancelled, abort citation synchronization altogether
                progress.close();
                return;
            } else {
                // not all entity editions succeeded, but none was cancelled
                progress.updateLine(
                    'error',
                    Wikicite.getString(
                        'wikicite.wikidata.progress.upload.error'
                    )
                );
                if (localItemsToUpdate.size) {
                    // if local changes pending, ask user whether to proceed
                    const proceed = Services.prompt.confirm(
                        window,
                        Wikicite.getString('wikicite.wikidata.upload.error.title'),
                        (
                            composeUploadErrorMsg(results) + '\n\n' +
                            Wikicite.getString('wikicite.wikidata.upload.error.proceed')
                        )
                    )
                    if (!proceed) {
                        localItemsToUpdate.clear();
                    }
                } else {
                    // no local changes pending, just show information dialog
                    Services.prompt.alert(
                        window,
                        Wikicite.getString('wikicite.wikidata.upload.error.title'),
                        composeUploadErrorMsg(results)
                    )
                }
            }
        }

        // Only then, run local actions
        if (localItemsToUpdate.size) {
            progress.newLine(
                'loading',
                Wikicite.getString(
                    'wikicite.wikidata.progress.local.update.loading'
                )
            );
            const matchers = {};
            for (const sourceItem of sourceItems) {
                if (!localItemsToUpdate.has(sourceItem.item.id)) {
                    // item not in the list of items to update; skip
                    continue;
                }

                // begin batch session so citations are not updated nor saved
                // until operations are over
                sourceItem.startBatch();

                // citations to add
                const addCitations = localAddCitations[sourceItem.item.id];
                if (addCitations.length) {
                    const libraryID = sourceItem.item.libraryID;
                    if (!matchers[libraryID]) {
                        // If there isn't a Matcher initialized for this library already
                        // create and initialize a new one
                        matchers[libraryID] = new Matcher(libraryID);
                        await matchers[libraryID].init();
                    }
                    const newCitations = [];
                    for (const targetCitation of addCitations) {
                        const targetItem = targetItems.get(targetCitation.value);
                        if (targetItem) {
                            const oci = OCI.getOci('wikidata', sourceItem.qid, targetCitation.value);
                            const citation = new Citation(
                                {
                                    item: targetItem,
                                    ocis: [oci]
                                },
                                sourceItem
                            );
                            citation.autoLink(matchers[libraryID]);
                            
                            // add the intentions of the citations to add
                            const intentions = targetCitation.intentions;
                            if (intentions) {
                                // if there is intentions
                                const translatedIntentions = [];
                                for (const intention of intentions) {
                                    // for every intention QIDs, find its corresponding key in the cito variable
                                    const [translatedIntention = null] = Object.entries(cito).find(([k, v]) => v === intention) || [];
                                    translatedIntentions.push(translatedIntention);
                                }
                                citation.target.intentions = translatedIntentions;
                            }

                            newCitations.push(citation)
                        } else {
                            // targetQid won't be found in targetItems map
                            // if corresponding Wikidata entity does not belong
                            // to a class supported by the Wikidata JSON translator
                            // e.g. "retracted paper (Q45182324)"
                            unsupportedCitations += 1;
                        }
                    }
                    // Fixme: the number of localAddCitations and localFlagCitations
                    // shown in the confirmation message above may be wrong, as the
                    // addCitations method below may find duplicate citations and
                    // decide to flag them instead of creating new ones.
                    // Use this info to show a message to the user (see #26)
                    sourceItem.addCitations(newCitations);
                }

                // citations to modify
                const modifyCitations = localModifyCitations[sourceItem.item.id];
                if (modifyCitations.length) {
                    for (const targetCitation of modifyCitations) {
                        const { citations } = sourceItem.getCitations(targetCitation.value, 'qid');
                        if (citations.length) {
                            for (const citation of citations) {
                                // add the intentions of the citations to add
                                const intentions = targetCitation.intentions;
                                if (intentions) {
                                    // if there is intentions
                                    const translatedIntentions = [];
                                    for (const intention of intentions) {
                                        // for every intention QIDs, find its corresponding key in the cito variable
                                        const [translatedIntention = null] = Object.entries(cito).find(([k, v]) => v === intention) || [];
                                        translatedIntentions.push(translatedIntention);
                                    }
                                    citation.target.intentions = translatedIntentions;
                                } else if (!intentions) {
                                    citation.target.intentions = [];
                                }
                            }
                        } else {
                            debug('No matching citations for QID ' + targetCitation.value);
                        }
                    }
                }

                // citations to flag
                const flagCitations = localFlagCitations[sourceItem.item.id];
                if (flagCitations.length) {
                    for (const targetCitation of flagCitations) {
                        const { citations } = sourceItem.getCitations(targetCitation.value, 'qid');
                        if (citations.length) {
                            for (const citation of citations) {
                                citation.addOCI(
                                    OCI.getOci('wikidata', sourceItem.qid, targetCitation.value)
                                );
                            }
                        } else {
                            debug('No matching citations for QID ' + targetCitation.value);
                        }
                    }
                }

                // citations to unflag
                const unflagCitations = localUnflagCitations[sourceItem.item.id];
                if (unflagCitations.length) {
                    for (const targetCitation of unflagCitations) {
                        const { citations } = sourceItem.getCitations(targetCitation.value, 'qid');
                        if (citations.length) {
                            for (const citation of citations) {
                                citation.removeOCI('wikidata');
                            }
                        } else {
                            throw new Error('No matching citations for QID ' + targetCitation.value);
                        }
                    }
                }

                // citations to delete
                const deleteCitations = localDeleteCitations[sourceItem.item.id];
                if (deleteCitations.length) {
                    for (const targetCitation of deleteCitations) {
                        const { indices } = sourceItem.getCitations(targetCitation.value, 'qid');
                        if (indices.length) {
                            for (const index of indices) {
                                sourceItem.deleteCitation(index);
                            }
                        } else {
                                throw new Error('No matching citations for QID ' + targetCitation.value);
                        }
                    }
                }

                // end batch session so citations are saved
                sourceItem.endBatch();
            }
            progress.updateLine(
                'done',
                Wikicite.getString(
                    'wikicite.wikidata.progress.local.update.done'
                )
            );
        }
        progress.close();

        // display information dialog with deviations from confirmation message above
        if (unsupportedCitations) {
            Services.prompt.alert(
                null,
                "",
                Wikicite.formatString(
                    'wikicite.wikidata.deviations.unsupported-citations',
                    unsupportedCitations
                )
            )
        }
    }

    // maybe i don't need a batch method for getting from PDF
    // because I don't think I want (or even can) call with multiple pdfs
    // But I may want to use Zotero.ProgressQueue to keep track of what is going on
}

// Compose confirmation message for the user to confirm actions to be taken
// before proceeding
function composeConfirmation(
    localItemsToUpdate,
    remoteEntitiesToUpdate,
    counters
) {
    // Message header
    let confirmMsg = Wikicite.getString(
        'wikicite.wikidata.confirm.message.header'
    );

    // local items to update section
    if (localItemsToUpdate.size) {
        confirmMsg += (
            '\n\n' +
            Wikicite.formatString(
                'wikicite.wikidata.confirm.message.local-items',
                localItemsToUpdate.size
            ) +
            ':'
        );
        if (counters.localAddCitations) {
            confirmMsg += '\n\t' + Wikicite.formatString(
                'wikicite.wikidata.confirm.message.local-add',
                counters.localAddCitations
            );
        }
        if (counters.localFlagCitations) {
            confirmMsg += '\n\t' + Wikicite.formatString(
                'wikicite.wikidata.confirm.message.local-flag',
                counters.localFlagCitations
            );
        }
        if (counters.localUnflagCitations) {
            confirmMsg += '\n\t' + Wikicite.formatString(
                'wikicite.wikidata.confirm.message.local-unflag',
                counters.localUnflagCitations
            );
        }
        if (counters.localDeleteCitations) {
            confirmMsg += '\n\t' + Wikicite.formatString(
                'wikicite.wikidata.confirm.message.local-delete',
                counters.localDeleteCitations
            );
        }
        if (counters.localModifyCitations) {
            confirmMsg += '\n\t' + Wikicite.formatString(
                'wikicite.wikidata.confirm.message.local-modify',
                counters.localModifyCitations
            );
        }
    }

    // remote entities to update section
    if (remoteEntitiesToUpdate.size) {
        confirmMsg += (
            '\n\n' +
            Wikicite.formatString(
                'wikicite.wikidata.confirm.message.remote-entities',
                remoteEntitiesToUpdate.size
            ) +
            ':'
        );
        if (counters.remoteAddCitations) {
            confirmMsg += '\n\t' + Wikicite.formatString(
                'wikicite.wikidata.confirm.message.remote-add',
                counters.remoteAddCitations
            );
        }
        if (counters.remoteModifyCitations) {
            confirmMsg += '\n\t' + Wikicite.formatString(
                'wikicite.wikidata.confirm.message.remote-modify',
                counters.remoteModifyCitations
            );
        }
    }

    // local citations that will not be changed section
    const unchangedCitationsCount = (
        counters.syncedCitations +
        counters.noQidCitations +
        counters.invalidOci
    );
    if (counters.unchangedCitations) {
        confirmMsg += (
            '\n\n' +
            Wikicite.formatString(
                'wikicite.wikidata.confirm.message.unchanged',
                unchangedCitationsCount
            ) +
            ':'
        );
        if (counters.syncedCitations) {
            confirmMsg += (
                '\n\t' +
                Wikicite.formatString(
                    'wikicite.wikidata.confirm.message.synced',
                    counters.syncedCitations
                )
            );
        }
        if (counters.noQidCitations) {
            confirmMsg += (
                '\n\t' +
                Wikicite.formatString(
                    'wikicite.wikidata.confirm.message.no-qid',
                    counters.noQidCitations
                )
            );
        }
        if (counters.invalidOci) {
            confirmMsg += (
                '\n\t' +
                Wikicite.formatString(
                    'wikicite.wikidata.confirm.message.invalid-oci',
                    counters.invalidOci
                )
            );
        }
    }

    // message footer
    confirmMsg += '\n\n' + Wikicite.getString(
        'wikicite.wikidata.confirm.message.footer'
    );

    return confirmMsg;
}

// Compose information message about what failed when uploading
// changes to Wikidata
function composeUploadErrorMsg(results) {
    // compose an information message saying that something went wrong
    let uploadErrorMsg = Wikicite.getString(
        'wikicite.wikidata.upload.error.header'
    ) + ':';
    // indicating which entities could not be edited due to insufficient
    // permissions (if any)
    const permissionDeniedQids = Object.keys(results).filter(
        (qid) => results[qid] === 'permissiondenied'
    );
    if (permissionDeniedQids.length) {
        uploadErrorMsg += (
            '\n\n' + Wikicite.getString(
                'wikicite.wikidata.upload.error.denied'
            ) + ': ' +
            permissionDeniedQids.join(', ') + '.'
        );
    }
    // which entity editions failed for unexpected reasons
    const unknownErrorQids = {};
    for (const [qid, result] of Object.entries(results)) {
        // results other than 'ok' and 'permissiondenied'
        // there should be no cancelled editions (see above)
        if (!['ok', 'cancelled', 'permissiondenied'].includes(result)) {
            if (!unknownErrorQids[result]) {
                unknownErrorQids[result] = [];
            }
            unknownErrorQids[result].push(qid);
        }
    }
    for (const err of Object.keys(unknownErrorQids)) {
        uploadErrorMsg += (
            // Entities failed with error
            '\n\n' + Wikicite.getString(
                'wikicite.wikidata.upload.error.unknown'
            ) +
            ' "' + err + '": ' +
            unknownErrorQids[err].join(', ') + '.'
        );
    }
    // say which entity editions succeeded as well
    const okQids = Object.keys(results).filter(
        (qid) => results[qid] === 'ok'
    );
    if (okQids.length) {
        uploadErrorMsg += (
            '\n\n' + Wikicite.getString(
                'wikicite.wikidata.upload.error.ok'
            ) + ': ' +
            okQids.join(', ') + '.'
        )
    }

    return uploadErrorMsg;
}
