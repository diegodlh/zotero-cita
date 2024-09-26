import SourceItemWrapper from "./sourceItemWrapper";
import Progress from "./progress";
import Citation from "./citation";
import Wikicite from "./wikicite";
import Bottleneck from "bottleneck";

// Initialize Bottleneck for rate limiting (max 50 requests per second)
const limiter = new Bottleneck({
	minTime: 20, // 50 requests per second
});

declare const Services: any;

export interface IndexedWork<Ref> {
	referenceCount: number;
	referencedWorks: Ref[];
}

export abstract class IndexerBase<Ref> {
	/**
	 * Abstract method to get references from the specific indexer.
	 * @param {string[]} identifiers - List of DOIs or other identifiers.
	 * @returns {Promise<IndexedWork[]>} Corresponding works.
	 */
	abstract getReferences(identifiers: string[]): Promise<IndexedWork<Ref>[]>;

	/**
	 * Abstract method to parse a list of references into Zotero items.
	 * @param {Ref[]} references - References for a specific work.
	 * @returns {Promise<Zotero.Item[]>} Zotero items parsed from the references.
	 */
	abstract parseReferences(references: Ref[]): Promise<Zotero.Item[]>;

	abstract indexerName: string;

	/**
	 * Get source item citations from the online database.
	 * @param {SourceItemWrapper[]} sourceItems - One or more source items to get citations for.
	 */
	async addCitationsToItems(
		sourceItems: SourceItemWrapper[],
		autoLinkCitations = true,
	) {
		// Filter items with valid identifiers (DOIs)
		const sourceItemsWithDOI = sourceItems.filter((sourceItem) =>
			sourceItem.getPID("DOI"),
		);
		if (sourceItemsWithDOI.length === 0) {
			Services.prompt.alert(
				window,
				Wikicite.formatString(
					"wikicite.indexer.get-citations.no-doi-title",
					this.indexerName,
				),
				Wikicite.formatString(
					"wikicite.indexer.get-citations.no-doi-message",
					this.indexerName,
				),
			);
			return;
		}

		// Ask user confirmation in case some selected items already have citations
		if (sourceItemsWithDOI.some((item) => item.citations.length)) {
			const confirmed = Services.prompt.confirm(
				window,
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

		const identifiers = sourceItemsWithDOI.map(
			(item) => item.getPID("DOI")!, // Guaranteed
		);
		const sourceItemReferences = await limiter
			.schedule(() => this.getReferences(identifiers))
			.catch((error) => {
				Zotero.log(`Error fetching references: ${error}`);
				return [];
			});

		// Confirm with the user to add citations
		const numberOfCitations: number[] = sourceItemReferences.map(
			(ref) => ref.referenceCount,
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
			window,
			Wikicite.formatString(
				"wikicite.indexer.get-citations.confirm-title",
				this.indexerName,
			),
			Wikicite.formatString(
				"wikicite.indexer.get-citations.confirm-message",
				[itemsToBeUpdated, sourceItems.length, citationsToBeAdded],
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

		try {
			let parsedItems = 0;
			const parsedItemReferences = await Promise.all(
				sourceItemReferences.map(async (work) => {
					if (!work.referenceCount) return [];
					const parsedReferences = await this.parseReferences(
						work.referencedWorks,
					);
					progress.updateLine(
						"loading",
						Wikicite.formatString(
							"wikicite.indexer.get-citations.parsing-progress",
							[++parsedItems, itemsToBeUpdated],
						),
					);
					return parsedReferences;
				}),
			);

			await Zotero.DB.executeTransaction(async () => {
				sourceItemsWithDOI.forEach((sourceItem, index) => {
					const newCitedItems = parsedItemReferences[index];
					if (newCitedItems.length > 0) {
						const newCitations = newCitedItems.map(
							(newItem) =>
								new Citation(
									{ item: newItem, ocis: [] },
									sourceItem,
								),
						);
						sourceItem.addCitations(newCitations);
						if (autoLinkCitations) sourceItem.autoLinkCitations();
					}
				});
			});

			// Auto-linking
			// FIXME: even though this is the same code as in localCitationNetwork, items are not updated. Workaround is to open the citation network
			/*if (autoLinkCitations) {
                Zotero.log("Auto-linking citations");
                const libraryID = sourceItemsWithDOI[0].item.libraryID;
                const matcher = new Matcher(libraryID);
                progress.updateLine(
                    'loading',
                    Wikicite.getString('wikicite.source-item.auto-link.progress.loading')
                    );
                await matcher.init();
                for (const wrappedItem of sourceItemsWithDOI) {
                    wrappedItem.autoLinkCitations(matcher, true);
                }
            }*/

			progress.updateLine(
				"done",
				Wikicite.formatString(
					"wikicite.indexer.get-citations.done",
					this.indexerName,
				),
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
