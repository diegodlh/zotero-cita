import SourceItemWrapper from "./sourceItemWrapper";
import Progress from "./progress";
import { Citation, CitationSource } from "./citation";
import Wikicite, { debug } from "./wikicite";
import Bottleneck from "bottleneck";
import ItemWrapper from "./itemWrapper";
import PID from "./PID";
import Matcher from "./matcher";
import _ = require("lodash");
import Lookup, { ParsedReference } from "./zotLookup";

export interface IndexedWork<R> {
	/**
	 * References found for the work.
	 */
	references: ParsableReference<R>[];
	/**
	 * The work's identifiers, if any.
	 */
	identifiers: PID[];
	/**
	 * Indexer-specific unique identifier.
	 * @remarks Do not make any assumptions about it except that it should be unique!
	 */
	primaryID: string;
}

export interface ParsableReference<R> {
	/**
	 * Indexer-specific unique identifier.
	 * @remarks Do not make any assumptions about it except that it should be unique!
	 */
	primaryID: string;

	/** The item's identifiers, if any. */
	externalIds: PID[]; // External identifiers

	/** The item's data */
	rawObject?: R;

	/** The item's OCI */
	oci?: string;
}

export abstract class IndexerBase<Ref> {
	/**
	 * Rate limiter to use for requests.
	 */
	abstract limiter: Bottleneck;

	/**
	 * Name of the indexer to be displayed.
	 */
	abstract indexerName: string;

	/**
	 * The indexer's own PID.
	 */
	abstract indexerPID: PIDType;

	/**
	 * Supported PIDs for the indexer.
	 */
	abstract supportedPIDs: PIDType[];

	abstract preferredChunkSize: number;
	abstract requiresGroupedIdentifiers: boolean;

	/**
	 * Abstract method to get references from the specific indexer.
	 * @param {PID[]} identifiers - List of DOIs or other identifiers.
	 * @returns {Promise<IndexedWork[]>} Corresponding works.
	 */
	abstract getIndexedWorks(identifiers: PID[]): Promise<IndexedWork<Ref>[]>;

	/**
	 * Optional method to search for a work in the indexer.
	 * @param {ItemWrapper} item - Item to search for.
	 * @param {boolean} allowSelection - Whether to allow the user to select a work.
	 * @returns {Promise<IndexedWork | null>} Indexed work found.
	 */
	searchIndexedWork?(
		item: ItemWrapper,
		allowSelection: boolean,
	): Promise<IndexedWork<Ref> | null>;

	/**
	 * Optional method to parse references manually.
	 * @param {ParsableReference<Ref>[]} references - Reference
	 * @returns {Zotero.Item[]} Zotero items parsed from the references.
	 */
	parseReferencesManually?(
		references: ParsableReference<Ref>[],
	): ParsedReference[];

	/**
	 * Filter source items with supported UIDs.
	 * @param sourceItems Selected items to filter depending on the indexer.
	 */
	filterItemsWithSupportedIdentifiers<T extends ItemWrapper>(
		sourceItems: T[],
	): {
		itemsWithIDsMap: Map<string, { sourceItem: T; pid: PID }>;
		itemsWithoutIDsMap: Map<string, T>;
	} {
		// The key here is the item's Zotero key
		const itemsWithIDsMap = new Map<string, { sourceItem: T; pid: PID }>();
		const itemsWithoutIDsMap = new Map<string, T>();

		for (const item of sourceItems) {
			const pid = item.getBestPID(this.supportedPIDs);
			if (pid) {
				itemsWithIDsMap.set(item.item.key, { sourceItem: item, pid });
			} else {
				itemsWithoutIDsMap.set(item.item.key, item);
			}
		}

		return { itemsWithIDsMap, itemsWithoutIDsMap };
	}

	groupAndChunkIdentifiers<T extends ItemWrapper>(
		itemMap: Map<string, { sourceItem: T; pid: PID }>,
	): PID[][] {
		const identifiers = Array.from(itemMap.values()).map(({ pid }) => pid);

		let groupedIdentifiers: { [key: string]: PID[] };
		if (this.requiresGroupedIdentifiers) {
			groupedIdentifiers = _.groupBy(identifiers, (pid) => pid.type);
		} else {
			groupedIdentifiers = { mixed: identifiers };
		}

		return Object.entries(groupedIdentifiers).flatMap(([pidType, pids]) =>
			_.chunk(pids, this.preferredChunkSize),
		);
	}

	/**
	 * Match source items to indexed works.
	 * @param zotKeyToSourceItem Map of Zotero keys to source item and PID.
	 * @param indexedWorks List of indexed works.
	 * @returns Map of Zotero key to IndexedWork.
	 */
	matchItemsToIndexedWorks<T extends ItemWrapper>(
		zotKeyToSourceItem: Map<
			string,
			{
				sourceItem: T;
				pid: PID;
			}
		>,
		indexedWorks: IndexedWork<Ref>[],
	): Map<string, IndexedWork<Ref>> {
		// We want to match the identifiers to the indexed works and return a map of Zotero key to IndexedWork
		const keyToIndexedWork = new Map<string, IndexedWork<Ref>>();
		const indexedWorksMap = new Map(
			indexedWorks.flatMap((work) => {
				return work.identifiers
					.filter((id) => id.comparable !== undefined)
					.map((id) => {
						return [id.comparable!, work];
					});
			}),
		);
		const lostSourceItems: T[] = [];
		for (const [
			zoteroKey,
			{ sourceItem, pid: sourcePID },
		] of zotKeyToSourceItem.entries()) {
			const comparable = sourcePID.comparable;
			let matched = false;

			if (comparable && indexedWorksMap.has(comparable)) {
				keyToIndexedWork.set(
					zoteroKey,
					indexedWorksMap.get(comparable)!,
				);
				matched = true;
			} else if (comparable && sourcePID.type === "OpenAlex") {
				// We try to match items that supplied an OpenAlex key with indexed works that have a MAG key
				// This is mostly done for Semantic Scholar, which doesn't directly support OpenAlex keys
				const comparableMAGKey = new PID(
					"MAG",
					sourcePID.cleanID!.substring(1),
				).comparable;
				if (comparableMAGKey && indexedWorksMap.has(comparableMAGKey)) {
					keyToIndexedWork.set(
						zoteroKey,
						indexedWorksMap.get(comparableMAGKey)!,
					);
					matched = true;
				}
			} else if (comparable && sourcePID.type === "DOI") {
				// We try to match items that supplied a DOI with indexed works that have an arXiv key
				// This is mostly done for Semantic Scholar, which doesn't directly support arXiv DOIs
				const comparableArXivKey = new PID("arXiv", sourcePID.cleanID!)
					.comparable;
				if (
					comparableArXivKey &&
					indexedWorksMap.has(comparableArXivKey)
				) {
					keyToIndexedWork.set(
						zoteroKey,
						indexedWorksMap.get(comparableArXivKey)!,
					);
					matched = true;
				}
			}

			if (!matched) {
				Zotero.log(
					`Could not find indexed work matching with ${sourceItem.title} (${sourcePID.comparable})`,
				);
				lostSourceItems.push(sourceItem);
			}
		}

		ztoolkit.log(
			`Matched ${keyToIndexedWork.size}/${indexedWorks.length} indexed works to identifiers. Had ${zotKeyToSourceItem.size} identifiers.`,
		);

		// TODO: do something with the lost source items and find which indexed works were not matched

		return keyToIndexedWork;
	}

	/**
	 * Check if the indexer can fetch citations for the item.
	 * @param item Item to check for fetchability.
	 */
	canFetchCitations(item: ItemWrapper): boolean {
		return item.getBestPID(this.supportedPIDs) !== null;
	}

	/**
	 * Fetch all references for a list of source items, parses them, and adds them to the source items.
	 * @param {SourceItemWrapper[]} sourceItems - One or more source items to get citations for.
	 * @param {boolean} autoLinkCitations - Whether to auto-link the citations.
	 */
	async addCitationsToItems(
		sourceItems: SourceItemWrapper[],
		autoLinkCitations: boolean = true,
	) {
		performance.mark("start-fetch-citations");
		ztoolkit.log("Fetching citations for source items...");
		const libraryID = sourceItems[0].item.libraryID;

		// Filter items with fetchable identifiers
		const { itemsWithIDsMap: zotKeyToSourceItemMap } =
			this.filterItemsWithSupportedIdentifiers(sourceItems);
		performance.mark("end-filter-items");
		performance.measure(
			"filter-items",
			"start-fetch-citations",
			"end-filter-items",
		);
		if (zotKeyToSourceItemMap.size === 0) {
			Services.prompt.alert(
				window as mozIDOMWindowProxy,
				Wikicite.formatString(
					"wikicite.indexer.get-citations.no-pid-title",
					this.indexerName,
				),
				Wikicite.formatString(
					"wikicite.indexer.get-citations.no-pid-message",
					[this.indexerName, this.supportedPIDs.join(", ")],
				),
			);
			return;
		}

		// Ask user confirmation in case some selected items already have citations
		const citationsAlreadyExist = Array.from(
			zotKeyToSourceItemMap.values(),
		).some((element) => element.sourceItem.citations.length);
		if (citationsAlreadyExist) {
			const confirmed = Services.prompt.confirm(
				window as mozIDOMWindowProxy,
				Wikicite.getString(
					"wikicite.indexer.get-citations.existing-citations-title",
				),
				Wikicite.formatString(
					"wikicite.indexer.get-citations.existing-citations-message",
					this.indexerName,
				),
			);
			if (!confirmed) return;
		}

		// Get reference information
		const progress = new Progress(
			"loading",
			Wikicite.formatString(
				"wikicite.indexer.get-citations.loading",
				this.indexerName,
			),
		);

		// Group and chunk identifiers
		const batchIdentifiers = this.groupAndChunkIdentifiers(
			zotKeyToSourceItemMap,
		);

		// Get results from indexer
		performance.mark("start-get-indexed-works");
		ztoolkit.log("Fetching indexed works...");
		const batchPromises = batchIdentifiers.map(
			async (batch, index): Promise<IndexedWork<Ref>[]> => {
				try {
					// Because OpenCitations does not support multiple identifiers in a single request, the limiter should be used within getIndexedWorks, not here
					const works = await this.getIndexedWorks(batch);
					return works;
				} catch (error) {
					Zotero.log(
						`Error fetching indexedWorks with ${this.indexerName} in batch ${index}: ${error}`,
						"error",
					);
					return [] as IndexedWork<Ref>[];
				}
				// TODO: update progress here?
			},
		);

		// Wait for all batch promises to resolve
		const indexedWorks = (await Promise.all(batchPromises)).flat();
		performance.mark("end-get-indexed-works");
		performance.measure(
			"get-indexed-works",
			"start-get-indexed-works",
			"end-get-indexed-works",
		);

		// Map results
		performance.mark("start-matching-identifiers");
		const keyToIndexedWorkMap = this.matchItemsToIndexedWorks(
			zotKeyToSourceItemMap,
			indexedWorks,
		);
		performance.mark("end-matching-identifiers");
		performance.measure(
			"match-identifiers",
			"start-matching-identifiers",
			"end-matching-identifiers",
		);

		// Count the number of citations to be added and ask for confirmation
		const numberOfCitations = indexedWorks.map(
			(item) => item.references.length,
		);
		const itemsToBeUpdated = numberOfCitations.filter((n) => n > 0).length;
		const citationsToBeAdded = numberOfCitations.reduce(
			(sum, n) => sum + n,
			0,
		);
		if (citationsToBeAdded === 0) {
			progress.updateLine(
				"error",
				Wikicite.formatString(
					"wikicite.indexer.get-citations.no-references",
					this.indexerName,
				),
			);
			return;
		}

		progress.updateLine("done", `Found ${citationsToBeAdded} citations.`);

		// Report
		ztoolkit.log(
			`Of ${sourceItems.length} source items, ${zotKeyToSourceItemMap.size} had identifiers compatible with ${this.indexerName}. Found ${indexedWorks.length} items on ${this.indexerName} (${itemsToBeUpdated} with references) and matched ${keyToIndexedWorkMap.size} of them to source items. Found ${citationsToBeAdded} citations in total.`,
		);

		// Ask for confirmation
		const confirmed = Services.prompt.confirm(
			window as mozIDOMWindowProxy,
			Wikicite.formatString(
				"wikicite.indexer.get-citations.confirm-title",
				this.indexerName,
			),
			Wikicite.formatString(
				"wikicite.indexer.get-citations.confirm-message",
				[itemsToBeUpdated, sourceItems.length],
			) +
				"\n\n" +
				Wikicite.formatString(
					"wikicite.indexer.get-citations.confirm-message-count",
					citationsToBeAdded,
				),
		);
		if (!confirmed) {
			progress.close();
			return;
		}

		// Parse the references and add them to the items
		progress.newLine(
			"loading",
			Wikicite.formatString(
				"wikicite.indexer.get-citations.parsing",
				this.indexerName,
			),
		);

		// Build a map of parsable references to source items
		const parsableReferenceMap = new Map<
			string,
			{
				parsableReference: ParsableReference<Ref>;
				sourceItemKeys: Set<string>;
			}
		>();

		performance.mark("start-building-parsable-reference-map");
		for (const [
			sourceItemKey,
			indexedWork,
		] of keyToIndexedWorkMap.entries()) {
			for (const ref of indexedWork.references) {
				const refKey = ref.primaryID;
				if (!parsableReferenceMap.has(refKey)) {
					parsableReferenceMap.set(refKey, {
						parsableReference: ref,
						sourceItemKeys: new Set(),
					});
				}
				parsableReferenceMap
					.get(refKey)!
					.sourceItemKeys.add(sourceItemKey);
			}
		}
		performance.mark("end-building-parsable-reference-map");
		performance.measure(
			"build-parsable-reference-map",
			"start-building-parsable-reference-map",
			"end-building-parsable-reference-map",
		);

		// Get the unique parsable references
		const uniqueParsableReferences = Array.from(
			parsableReferenceMap.values(),
		).map((entry) => entry.parsableReference);

		ztoolkit.log(
			`Check: ${parsableReferenceMap.size} vs ${uniqueParsableReferences.length}.`,
		);

		// Parse all references at once
		performance.mark("start-parsing-references");
		ztoolkit.log("Parsing references...");
		let parsedReferences: ParsedReference[] = [];
		try {
			parsedReferences = await this.parseReferences(
				uniqueParsableReferences,
			);
		} catch (error) {
			progress.updateLine(
				"error",
				Wikicite.formatString(
					"wikicite.indexer.get-citations.error-parsing-references",
					this.indexerName,
				),
			);
			Zotero.log(`Parsing references failed due to error: ${error}`);
			return;
		}
		performance.mark("end-parsing-references");
		performance.measure(
			"parse-references",
			"start-parsing-references",
			"end-parsing-references",
		);

		progress.updateLine("done", "References parsed.");

		progress.newLine("loading", "Updating items...");

		// Build a map from primaryID to parsed item
		performance.mark("start-building-final-map");
		const parsedReferenceMap = new Map();
		for (const parsedRef of parsedReferences) {
			parsedReferenceMap.set(parsedRef.primaryID, parsedRef.item);
		}

		// Build finalPairings: map from sourceItemKey to parsed references
		const finalPairings = new Map<
			string,
			{ primaryID: string; item: Zotero.Item; oci?: string }[]
		>();

		for (const [
			refKey,
			{ parsableReference, sourceItemKeys },
		] of parsableReferenceMap.entries()) {
			const parsedItem = parsedReferenceMap.get(refKey);
			if (!parsedItem) {
				// The reference could not be parsed
				continue;
			}
			for (const sourceItemKey of sourceItemKeys) {
				if (!finalPairings.has(sourceItemKey)) {
					finalPairings.set(sourceItemKey, []);
				}
				finalPairings.get(sourceItemKey)!.push({
					primaryID: refKey,
					item: parsedItem,
					oci: parsableReference.oci,
				});
			}
		}

		// Convert finalPairings to array for processing
		const finalPairingsArray = Array.from(finalPairings.entries())
			.map(([sourceItemKey, itemsToAdd]) => {
				const sourceItemEntry =
					zotKeyToSourceItemMap.get(sourceItemKey);
				if (!sourceItemEntry) return null;
				const sourceItem = sourceItemEntry.sourceItem;
				return {
					sourceItem,
					itemsToAdd,
				};
			})
			.filter((entry) => entry !== null) as {
			sourceItem: SourceItemWrapper;
			itemsToAdd: {
				primaryID: string;
				item: Zotero.Item;
				oci?: string;
			}[];
		}[];
		performance.mark("end-building-final-map");
		performance.measure(
			"build-final-map",
			"start-building-final-map",
			"end-building-final-map",
		);

		// Proceed to update the source items
		// Note: inspired by the syncItemCitationsWithWikidata method in citations.ts
		performance.mark("start-updating-items");
		ztoolkit.log("Updating items...");
		let matcher: Matcher;
		if (autoLinkCitations) {
			matcher = new Matcher(libraryID);
			await matcher.init();
		}
		for (const { sourceItem, itemsToAdd } of finalPairingsArray) {
			sourceItem.startBatch();
			const citations: Citation[] = [];
			for (const parsedRef of itemsToAdd) {
				const newCitation = new Citation(
					{
						item: parsedRef.item,
						ocis: [],
						citationSource: this.indexerName as CitationSource,
					},
					sourceItem,
				);

				// Add known PIDs to the citation
				if (parsableReferenceMap.has(parsedRef.primaryID)) {
					const { parsableReference } = parsableReferenceMap.get(
						parsedRef.primaryID,
					)!;
					for (const pid of parsableReference.externalIds) {
						newCitation.target.setPID(pid.type, pid.id, false);
					}
				}

				// Auto-link the citation
				if (autoLinkCitations) {
					await newCitation.autoLink(matcher!);
				}

				// Add OCI if available
				if (parsedRef.oci) {
					newCitation.addOCI(parsedRef.oci);
				}

				citations.push(newCitation);
			}
			sourceItem.addCitations(citations);
			sourceItem.endBatch();
		}
		ztoolkit.log("Items updated.");
		performance.mark("end-updating-items");
		performance.measure(
			"updating-items",
			"start-updating-items",
			"end-updating-items",
		);
		performance.measure(
			"fetch-citations-total",
			"start-fetch-citations",
			"end-updating-items",
		);

		progress.updateLine(
			"done",
			Wikicite.formatString("wikicite.indexer.get-citations.done", [
				parsedReferences.length,
				citationsToBeAdded,
				this.indexerName,
			]),
		);

		progress.close();
	}

	/**
	 * Parse a list of references into Zotero items.
	 * @param {ParsableReference<Ref>[]} references - An item references to parse.
	 * @returns {Promise<Zotero.Item[]>} Zotero items parsed from the references.
	 */
	async parseReferences(
		references: ParsableReference<Ref>[],
	): Promise<ParsedReference[]> {
		if (!references.length) {
			throw new Error("No references to parse");
		}

		// Separate references with compatible identifiers from those without
		performance.mark("start-triaging-references");
		const [refsWithIds, refsWithoutIds] = _.partition(
			references,
			(ref) =>
				ref.externalIds?.length &&
				ref.externalIds.some((pid) =>
					Lookup.pidsSupportedForLookup.includes(pid.type),
				),
		);
		const refsWithRawData = refsWithoutIds.filter((ref) => ref.rawObject);
		const rawDataCount = refsWithRawData.length;
		const unparseableCount = refsWithoutIds.length - rawDataCount;
		performance.mark("end-triaging-references");
		performance.measure(
			"triage-references",
			"start-triaging-references",
			"end-triaging-references",
		);

		let failCount = 0;
		let duplicateCount = 0;
		const parsedReferences: ParsedReference[] = [];
		performance.mark("start-lookup-items");
		// Look up items with identifiers
		// TODO: implement fallback mechanism for failed identifiers
		const lookupResult = await Lookup.lookupItems(
			refsWithIds,
			(failedPIDs) => (failCount += failedPIDs.length),
		);
		if (lookupResult) {
			duplicateCount = lookupResult.duplicateCount;
			parsedReferences.push(...lookupResult.parsedReferences);
		}
		performance.mark("end-lookup-items");
		performance.measure(
			"lookup-items",
			"start-lookup-items",
			"end-lookup-items",
		);

		const successfulIdentifiers = parsedReferences.length;

		// Optionally parse "unidentified" references manually
		// TODO: for Semantic Scholar at least, there's a few references that have only a CorpusID, which we currently don't support lookup for. These are counted as "rawData" references, which could be parsed here.
		let manuallyParsedCount = 0;
		if (this.parseReferencesManually && refsWithRawData.length) {
			const manuallyParsed =
				this.parseReferencesManually(refsWithRawData);
			manuallyParsedCount = manuallyParsed.length;
			parsedReferences.push(...manuallyParsed);
		}

		// Report
		const totalReferences = references.length;
		const totalParsed = parsedReferences.length;

		Zotero.log(`Had ${totalReferences} references to parse. Split into ${refsWithIds.length} lookup identifiers, ${rawDataCount} references with raw data, and ${unparseableCount} references with neither data nor identifier. Tally: ${refsWithIds.length + rawDataCount + unparseableCount} out of ${totalReferences} references.
Successfully parsed ${successfulIdentifiers} identifiers, failed to parse ${failCount}, found ${duplicateCount} duplicates. Tally: ${successfulIdentifiers + failCount + duplicateCount} out of ${refsWithIds.length} identifiers.
Manually parsed ${manuallyParsedCount} references out of ${rawDataCount}.
Grand total: ${totalParsed} out of ${totalReferences} references.`);

		// Return parsed references
		return parsedReferences;
	}

	async fetchMultiplePIDs(items: ItemWrapper[]): Promise<void> {
		// Filter out items that already have the indexer's PID
		const itmesWithoutIndexerID = items.filter(
			(item) => !item.getPID(this.indexerPID),
		);

		const {
			itemsWithIDsMap: itemsWithIDs,
			itemsWithoutIDsMap: itemsToSearch,
		} = this.filterItemsWithSupportedIdentifiers(itmesWithoutIndexerID);

		ztoolkit.log(
			`Fetching PIDs on ${this.indexerName} for ${itemsWithIDs.size} items with identifiers and searching for ${itemsToSearch.size} items...`,
		);

		const batchIdentifiers = this.groupAndChunkIdentifiers(itemsWithIDs);
		const batchPromises = batchIdentifiers.map(
			async (batch, index): Promise<IndexedWork<Ref>[]> => {
				try {
					// Because OpenCitations does not support multiple identifiers in a single request, the limiter should be used within getIndexedWorks, not here
					const works = await this.getIndexedWorks(batch);
					return works;
				} catch (error) {
					Zotero.log(
						`Error fetching indexedWorks with ${this.indexerName} in batch ${index}: ${error}`,
						"error",
					);
					return [] as IndexedWork<Ref>[];
				}
			},
		);

		// Wait for all batch promises to resolve
		const indexedWorks = (await Promise.all(batchPromises)).flat();
		const matchingWorks = this.matchItemsToIndexedWorks(
			itemsWithIDs,
			indexedWorks,
		);

		for (const [zotKey, indexedWork] of matchingWorks) {
			const item = itemsWithIDs.get(zotKey);
			if (item) {
				indexedWork.identifiers.forEach((pid) => {
					// Only set the PID if it's not already set or if it's the one we were actually fetching/refreshing
					if (
						pid.type === this.indexerPID ||
						!item.sourceItem.getPID(pid.type)
					)
						try {
							item.sourceItem.setPID(
								pid.type,
								pid.cleanID || pid.id,
								true,
							);
						} catch (e) {
							// To avoid breaking the loop in case one type is unsupported (ISBN in particular)
							Zotero.logError(e as Error);
						}
				});
			}
		}

		// Search for items without IDs
		if (!this.searchIndexedWork) return;
		await Promise.all(
			Array.from(itemsToSearch.values()).map(async (item) => {
				const work = (await this.searchIndexedWork!(
					item,
					false,
				)) as IndexedWork<Ref>;
				if (work) {
					ztoolkit.log(
						`Found work for ${item.title} on ${this.indexerName}`,
					);
					work.identifiers.forEach((pid) => {
						// Only set the PID if it's not already set or if it's the one we were actually fetching/refreshing
						if (
							pid.type === this.indexerPID ||
							!item.getPID(pid.type)
						)
							try {
								item.setPID(
									pid.type,
									pid.cleanID || pid.id,
									true,
								);
							} catch (e) {
								// To avoid breaking the loop in case one type is unsupported (ISBN in particular)
								Zotero.logError(e as Error);
							}
					});
				} else {
					ztoolkit.log(
						`No work found for ${item.title} on ${this.indexerName}`,
					);
				}
			}),
		);
	}
}
