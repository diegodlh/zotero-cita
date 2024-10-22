import SourceItemWrapper from "./sourceItemWrapper";
import Progress from "./progress";
import Citation from "./citation";
import Wikicite from "./wikicite";
import Bottleneck from "bottleneck";
import ItemWrapper from "./itemWrapper";
import PID from "./PID";
import Matcher from "./matcher";
import { it } from "node:test";

export interface IndexedWork<Ref> {
	referenceCount: number;
	referencedWorks: Ref[];
	identifiers: PID[];
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
	 * Abstract method to parse a list of references into Zotero items.
	 * @param {Ref[]} references - References for a specific work.
	 * @returns {Promise<Zotero.Item[]>} Zotero items parsed from the references.
	 */
	abstract parseReferences(references: Ref[]): Promise<Zotero.Item[]>;

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
			(item) => item.referenceCount,
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
				new Array(...pidToIndexedWorkMap.entries()).map(
					async ([pid, work]): Promise<{
						pid: string;
						parsedReferences: Zotero.Item[];
					}> => {
						if (!work.referenceCount)
							return { pid, parsedReferences: [] };
						const parsedReferences = await this.parseReferences(
							work.referencedWorks,
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
			const pidToParsedReferencesMap = new Map<string, Zotero.Item[]>();
			_parsedReferences.forEach(({ pid, parsedReferences }) => {
				pidToParsedReferencesMap.set(pid, parsedReferences);
			});

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
}
