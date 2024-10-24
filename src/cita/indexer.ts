import SourceItemWrapper from "./sourceItemWrapper";
import Progress from "./progress";
import Citation from "./citation";
import Wikicite, { debug } from "./wikicite";
import Bottleneck from "bottleneck";
import ItemWrapper from "./itemWrapper";
import PID from "./PID";
import Matcher from "./matcher";
import _ = require("lodash");
import Lookup from "./zotLookup";

export interface IndexedWork<R> {
	/**
	 * References found for the work.
	 */
	references: ParsableItem<R>[];
	/**
	 * The work's identifiers, if any.
	 */
	identifiers: PID[];
	/**
	 * Indexer-specific unique identifier.
	 * @remarks Do not make any assumptions about it except that it should be unique!
	 */
	key: string;
}

export interface ParsableItem<R> {
	/**
	 * Indexer-specific unique identifier.
	 * @remarks Do not make any assumptions about it except that it should be unique!
	 */
	key: string;

	/** The item's identifiers, if any. */
	externalIds: PID[]; // External identifiers

	/** The item's data */
	rawObject?: R;

	/** The item's OCI */
	oci?: string;
}

export abstract class IndexerBase<Ref> {
	maxRPS: number = 1000; // Requests per second
	maxConcurrent: number = 100; // Maximum concurrent requests

	// Initialize Bottleneck for rate limiting (max 50 requests per second)
	limiter = new Bottleneck({
		minTime: 1 / this.maxRPS,
		maxConcurrent: this.maxConcurrent,
	});

	/**
	 * Name of the indexer to be displayed.
	 */
	abstract indexerName: string;

	/**
	 * Supported PIDs for the indexer.
	 */
	abstract supportedPIDs: PIDType[];

	/**
	 * Abstract method to get references from the specific indexer.
	 * @param {PID[]} identifiers - List of DOIs or other identifiers.
	 * @returns {Promise<IndexedWork[]>} Corresponding works.
	 */
	abstract getIndexedWorks(identifiers: PID[]): Promise<IndexedWork<Ref>[]>;

	/**
	 * Optional function to parse references manually.
	 * @param {ParsableItem<Ref>[]} references - Reference
	 * @returns {Zotero.Item[]} Zotero items parsed from the references.
	 */
	parseReferencesManually?(references: ParsableItem<Ref>[]): Zotero.Item[];

	/**
	 * Filter source items with supported UIDs.
	 * @param sourceItems Selected items to filter depending on the indexer.
	 */
	filterItemsWithSupportedIdentifiers(
		sourceItems: SourceItemWrapper[],
	): Map<string, { sourceItem: SourceItemWrapper; pid: PID }> {
		const itemsMap = new Map<
			string,
			{ sourceItem: SourceItemWrapper; pid: PID }
		>();

		for (const item of sourceItems) {
			const pid = item.getBestPID(this.supportedPIDs);
			if (pid) {
				itemsMap.set(pid.id, { sourceItem: item, pid });
			}
		}

		return itemsMap;
	}

	matchIdentifiers(
		identifiers: PID[],
		indexedWorks: IndexedWork<Ref>[],
	): Map<string, IndexedWork<Ref>> {
		const pidToIndexedWorkMap = new Map<string, IndexedWork<Ref>>();
		for (const indexedWork of indexedWorks) {
			const indexerIds = indexedWork.identifiers;
			const pidValue = identifiers.find((pid) =>
				indexerIds.some((_pid) => PID.equal(pid, _pid)),
			)?.id;
			if (pidValue) pidToIndexedWorkMap.set(pidValue, indexedWork);
		}

		ztoolkit.log(
			`Matched ${pidToIndexedWorkMap.size}/${indexedWorks.length} indexed works to identifiers. Had ${identifiers.length} identifiers.`,
		);
		if (pidToIndexedWorkMap.size !== indexedWorks.length) {
			const missingIdentifiers = identifiers.filter(
				(pid) => !pidToIndexedWorkMap.has(pid.id),
			);
			Zotero.warn(
				new Error(
					`Missing identifiers: ${missingIdentifiers.map((pid) => `${pid.type}:${pid.id}`).join(", ")}`,
				),
			);
		}

		return pidToIndexedWorkMap;
	}

	/**
	 * Check if the indexer can fetch citations for the item.
	 * @param item Item to check for fetchability.
	 */
	canFetchCitations(item: ItemWrapper): boolean {
		return item.getBestPID(this.supportedPIDs) !== null;
	}

	/**
	 * Get source item citations from the online database.
	 * @param {SourceItemWrapper[]} sourceItems - One or more source items to get citations for.
	 */
	async addCitationsToItems(
		sourceItems: SourceItemWrapper[],
		autoLinkCitations = true,
	) {
		const libraryID = sourceItems[0].item.libraryID;

		// Filter items with valid identifiers (DOI or other)
		const pidToSourceItemMap =
			this.filterItemsWithSupportedIdentifiers(sourceItems);
		if (pidToSourceItemMap.size === 0) {
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
			pidToSourceItemMap.values(),
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

		// Get results from indexer
		// Note: for most indexers, this will be a single request. If needed, limiting is done in the indexer.
		const identifiers = Array.from(pidToSourceItemMap.values()).map(
			(item) => item.pid,
		);
		const indexedWorks = await this.getIndexedWorks(identifiers).catch(
			(error) => {
				Zotero.log(`Error fetching indexedWorks: ${error}`, "error");
				return [];
			},
		);

		// Confirm with the user to add citations
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
		progress.updateLine(
			"loading",
			Wikicite.formatString(
				"wikicite.indexer.get-citations.parsing",
				this.indexerName,
			),
		);
		const pidToIndexedWorkMap = this.matchIdentifiers(
			identifiers,
			indexedWorks,
		);

		try {
			let parsedItems = 0;
			const _parsedReferences = await Promise.all(
				// TODO: when fetching references for more than one source item, we should group all parsing together to avoid duplicate requests and then reattribute them to the source items
				new Array(...pidToIndexedWorkMap.entries()).map(
					async ([pid, work]): Promise<{
						pid: string;
						parsedReferences: Zotero.Item[];
					}> => {
						if (!work.references.length)
							return { pid, parsedReferences: [] };
						const parsedReferences = await this.parseReferences(
							work.references,
						).catch((error) => {
							Zotero.log(
								new Error(
									`Error parsing references for ${pid}: ${error}`,
								),
							);
							return [];
						});
						progress.updateLine(
							"loading",
							Wikicite.formatString(
								"wikicite.indexer.get-citations.parsing-progress",
								[++parsedItems, itemsToBeUpdated],
							),
						);
						return { pid, parsedReferences };
					},
				),
			);
			const pidToParsedReferencesMap = new Map(
				_parsedReferences.map(({ pid, parsedReferences }) => [
					pid,
					parsedReferences,
				]),
			);

			const refsFound = _parsedReferences
				.map((ref) => ref.parsedReferences.length)
				.reduce((sum, n) => sum + n, 0);

			// Reconcialiation
			const sourceItemToZotItemsMap = new Map<
				SourceItemWrapper,
				Zotero.Item[]
			>(); // Map of source items to Zotero items
			for (const [pid, { sourceItem }] of pidToSourceItemMap) {
				const parsedReferences = pidToParsedReferencesMap.get(pid);
				if (!parsedReferences || !parsedReferences.length) continue;

				sourceItemToZotItemsMap.set(sourceItem, parsedReferences);
			}

			// Auto-linking callback
			const autoLinkCallback = async () => {
				if (autoLinkCitations) {
					// We need to wait a bit after the transaction is done so that the citations are saved to storage
					setTimeout(async () => {
						const matcher = new Matcher(libraryID);
						await matcher.init();
						for (const [
							wrappedItem,
							_,
						] of sourceItemToZotItemsMap) {
							wrappedItem.autoLinkCitations(matcher, true);
						}
					}, 100);
				}
			};

			await Zotero.DB.executeTransaction(
				async () => {
					for (const [
						sourceItem,
						parsedReferences,
					] of sourceItemToZotItemsMap) {
						const citations = parsedReferences.map(
							(newItem) =>
								new Citation(
									{ item: newItem, ocis: [] },
									sourceItem,
								),
						);
						sourceItem.addCitations(citations);
					}
				},
				{ onCommit: autoLinkCallback },
			);

			progress.updateLine(
				"done",
				Wikicite.formatString("wikicite.indexer.get-citations.done", [
					refsFound,
					citationsToBeAdded,
					this.indexerName,
				]),
			);
		} catch (error) {
			progress.updateLine(
				"error",
				Wikicite.formatString(
					"wikicite.indexer.get-citations.error-parsing-references",
					this.indexerName,
				),
			);
			Zotero.log(`Adding citations failed due to error: ${error}`);
		} finally {
			progress.close();
		}
	}

	/**
	 * Parse a list of references into Zotero items.
	 * @param {ParsableItem<Ref>[]} references - An item references to parse.
	 * @returns {Promise<Zotero.Item[]>} Zotero items parsed from the references.
	 */
	async parseReferences(
		references: ParsableItem<Ref>[],
	): Promise<Zotero.Item[]> {
		if (!references.length) {
			throw new Error("No references to parse");
		}

		// Separate references with compatible identifiers from those without
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

		// Extract identifiers from references and group them by type
		const allIdentifiers = refsWithIds.map((ref) => {
			// Create a map of externalIds for quick lookup by type
			const pidMap = new Map(
				ref.externalIds.map((pid) => [pid.type, pid]),
			);

			// Iterate through pidsSupportedForLookup in order of priority and find the first match
			for (const type of Lookup.pidsSupportedForLookup) {
				const pid = pidMap.get(type);
				if (pid) return pid;
			}
			// A match is guaranteed to be found since we filtered out references without identifiers supported for lookup
			// So this should never happen:
			throw new Error("No supported PID found");
		});
		const [lookupIdentifiers, otherIdentifiers] = _.partition(
			allIdentifiers,
			(pid) => ["DOI", "ISBN", "PMID", "arXiv"].includes(pid.type),
		);
		const [openAlexIdentifiers, magIdentifiers] = _.partition(
			otherIdentifiers,
			(pid) => pid.type === "OpenAlex",
		);
		// Unique identifiers
		const uniqueLookupIdentifiers = _.uniqWith(
			lookupIdentifiers,
			PID.equal,
		);
		const uniqueOpenAlexIdentifiers = _.uniqWith(
			openAlexIdentifiers,
			PID.equal,
		);
		const uniqueMagIdentifiers = _.uniqWith(magIdentifiers, PID.equal);
		// TODO: make sure we track the total count correctly

		let failCount = 0;
		const parsedReferences: Zotero.Item[] = [];
		// Look up items with identifiers supported by Zotero
		if (uniqueLookupIdentifiers.length) {
			// TODO: implement fallback mechanism for failed identifiers
			const lookupResult = await Lookup.lookupItemsByIdentifiers(
				uniqueLookupIdentifiers,
				false,
				(failedPIDs) => (failCount += failedPIDs.length),
			);
			if (lookupResult) parsedReferences.push(...lookupResult);
		}

		// Look up items with OpenAlex identifiers
		if (uniqueOpenAlexIdentifiers.length) {
			const openAlexResult = await Lookup.lookupItemsOpenAlex(
				uniqueOpenAlexIdentifiers,
			);
			if (openAlexResult) {
				failCount +=
					uniqueOpenAlexIdentifiers.length - openAlexResult.length;
				parsedReferences.push(...openAlexResult);
			}
		}
		// Look up items with MAG identifiers
		if (uniqueMagIdentifiers.length) {
			const magResult = await Lookup.lookupItemsOpenAlex(
				uniqueMagIdentifiers,
				"MAG",
			);
			if (magResult) {
				failCount += uniqueMagIdentifiers.length - magResult.length;
				parsedReferences.push(...magResult);
			}
		}

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
		const duplicates =
			lookupIdentifiers.length -
			uniqueLookupIdentifiers.length +
			(openAlexIdentifiers.length - uniqueOpenAlexIdentifiers.length) +
			(magIdentifiers.length - uniqueMagIdentifiers.length);

		Zotero.log(`Had ${totalReferences} references to parse. Split into ${lookupIdentifiers.length} lookup identifiers, ${openAlexIdentifiers.length} OpenAlex identifiers, ${magIdentifiers.length} MAG identifiers. ${rawDataCount} references with raw data, and ${unparseableCount} references with neither data nor identifier. Tally: ${lookupIdentifiers.length + openAlexIdentifiers.length + magIdentifiers.length + rawDataCount + unparseableCount} out of ${totalReferences} references.
Successfully parsed ${successfulIdentifiers} identifiers, failed to parse ${failCount}, found ${duplicates} duplicates. Tally: ${successfulIdentifiers + failCount + duplicates} out of ${allIdentifiers.length} identifiers.
Manually parsed ${manuallyParsedCount} references out of ${rawDataCount}.
Grand total: ${totalParsed} out of ${totalReferences} references.`);

		// Return parsed references
		return parsedReferences;
	}
}
