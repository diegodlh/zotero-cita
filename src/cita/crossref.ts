import SourceItemWrapper from "./sourceItemWrapper";
import Progress from "./progress";
import Citation from "./citation";
import Wikicite, { debug } from "./wikicite";
import Lookup from "./zotLookup";
import Bottleneck from "bottleneck";

// Initialize Bottleneck for rate limiting (max 50 requests per second)
const limiter = new Bottleneck({
	minTime: 20, // 50 requests per second
});

declare const Services: any;

export default class Crossref {
	/*static getCitations(items: SourceItemWrapper[]) {
    
    if (items.length) {
    Crossref.addCrossrefCitationsToItems(items);
    }
    
    Services.prompt.alert(
    window,
    Wikicite.getString("wikicite.global.unsupported"),
    Wikicite.getString("wikicite.crossref.get-citations.unsupported"),
    );
    }
    
    static getDOI() {}*/

	/**
	 * Get source item citations from CrossRef.
	 * @param {SourceItemWrapper[]} sourceItems - One or more source items to get citations for.
	 */
	static async addCrossrefCitationsToItems(
		sourceItems: SourceItemWrapper[],
		autoLinkCitations = true,
	) {
		// Make sure that at least some of the source items have DOIs
		const sourceItemsWithDOI = sourceItems.filter((sourceItem) =>
			sourceItem.getPID("DOI"),
		);
		if (sourceItemsWithDOI.length == 0) {
			Services.prompt.alert(
				window,
				Wikicite.getString(
					"wikicite.crossref.get-citations.no-doi-title",
				),
				Wikicite.getString(
					"wikicite.crossref.get-citations.no-doi-message",
				),
			);
			return;
		}

		if (sourceItemsWithDOI.some((item) => item.citations.length)) {
			const confirmed = Services.prompt.confirm(
				window,
				Wikicite.getString("wikicite.crossref.get-citations.existing-citations-title"),
				Wikicite.getString("wikicite.crossref.get-citations.existing-citations-message"),
			);
			if (!confirmed) return;
		}

		// Get reference information for items from CrossRef
		const progress = new Progress(
			"loading",
			Wikicite.getString("wikicite.crossref.get-citations.loading"),
		);

		const sourceItemReferences = await Promise.all(
			sourceItemsWithDOI.flatMap((sourceItem) => {
				if (sourceItem.doi) {
					// Use rate limiting to fetch references from Crossref
					return limiter
						.schedule(() => Crossref.getReferences(sourceItem.doi))
						.catch((error) => {
							// Handle and log the error within the promise chain
							Zotero.log(
								`Error fetching references for DOI ${sourceItem.doi}`,
							);
							Zotero.logError(error);
							return []; // Return an empty array on error so that the promise resolves
						});
				}
				return []; // Return empty array for items without DOI
			}),
		);

		// Confirm with the user to add these citations
		const numberOfCitations = sourceItemReferences.map(
			(references) => references.length,
		);
		const itemsToBeUpdated = numberOfCitations.filter(
			(number) => number > 0,
		).length;
		const citationsToBeAdded = numberOfCitations.reduce(
			(sum, value) => sum + value,
			0,
		);
		if (citationsToBeAdded == 0) {
			progress.updateLine(
				"error",
				Wikicite.getString(
					"wikicite.crossref.get-citations.no-references",
				),
			);
			return;
		}
		const confirmed = Services.prompt.confirm(
			window,
			Wikicite.getString("wikicite.crossref.get-citations.confirm-title"),
			Wikicite.formatString(
				"wikicite.crossref.get-citations.confirm-message",
				[itemsToBeUpdated, sourceItems.length, citationsToBeAdded],
			),
		);
		if (!confirmed) {
			progress.close();
			return;
		}

		// Parse this reference information, then add to sourceItems
		progress.updateLine(
			"loading",
			Wikicite.getString("wikicite.crossref.get-citations.parsing"),
		);

		try {
			let parsedItems = 0;
			const parsedItemReferences = await Promise.all(
				sourceItemReferences.map(async (sourceItemReferenceList) => {
					if (!sourceItemReferenceList.length) return [];

					const parsedReferences = await Crossref.parseReferences(
						sourceItemReferenceList,
					);
					progress.updateLine(
						"loading",
						Wikicite.formatString(
							"wikicite.crossref.get-citations.parsing-progress",
							[++parsedItems, itemsToBeUpdated],
						),
					);
					return parsedReferences;
				}),
			);

			// Add these citations to the items
			await Zotero.DB.executeTransaction(async function () {
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
				Wikicite.getString("wikicite.crossref.get-citations.done"),
			);
		} catch (error) {
			progress.updateLine(
				"error",
				Wikicite.getString(
					"wikicite.crossref.get-citations.error-parsing-references",
				),
			);
			Zotero.log(
				`Adding Crossref citations failed due to error: ${error}`,
			);
		} finally {
			progress.close();
		}
	}

	/**
	 * Get a list of references from Crossref for an item with a certain DOI.
	 * Returned in JSON Crossref format.
	 * @param {string} doi - DOI for the item for which to get references.
	 * @returns {Promise<string[]>} list of references, or [] if none.
	 */
	static async getReferences(doi: string): Promise<string[]> {
		const url = `https://api.crossref.org/works/${Zotero.Utilities.cleanDOI(
			doi,
		)}`;
		const options = {
			headers: {
				"User-Agent": `${Wikicite.getUserAgent()} mailto:cita@duck.com`,
			},
			responseType: "json",
		};

		const response = await Zotero.HTTP.request("GET", url, options).catch(
			(e) => {
				debug(`Couldn't access URL: ${url}. Got status ${e.status}.`);
				if (e.status == 429) {
					throw new Error(
						"Received a 429 rate limit response from Crossref (https://github.com/CrossRef/rest-api-doc#rate-limits). Try getting references for fewer items at a time.",
					);
				}
			},
		);
		if (!response) return [];

		return response.response.message.reference || [];
	}

	/**
	 * Parse a list of references in JSON Crossref format.
	 * @param {any[]} crossrefReferences - Array of Crossref references to parse to Zotero items.
	 * @returns {Promise<Zotero.Item[]>} Zotero items parsed from references (where parsing is possible).
	 */
	static async parseReferences(
		crossrefReferences: any[],
	): Promise<Zotero.Item[]> {
		if (!crossrefReferences.length) {
			debug("Item found in Crossref but doesn't contain any references");
			return [];
		}

		const crossrefIdentifiers = crossrefReferences
			.map((item) => item.DOI ?? item.ISBN ?? null)
			.filter(Boolean)
			.flatMap(Zotero.Utilities.extractIdentifiers);
		//Zotero.debug(`Will look up following identifiers: ${JSON.stringify(crossrefIdentifiers)}`);
		const crossrefReferencesWithoutIdentifier = crossrefReferences.filter(
			(item) => !item.DOI && !item.ISBN,
		);
		const result =
			await Lookup.lookupItemsByIdentifiers(crossrefIdentifiers);
		const parsedReferences = result ? result : [];
		//Zotero.debug(`Found ${parsedReferences.length} references with identifier`);

		//Zotero.log(`Will now manually process ${crossrefReferencesWithoutIdentifier.length} refs`);
		const manualResult = await Promise.allSettled(
			crossrefReferencesWithoutIdentifier.map((item) =>
				this.parseItemFromCrossrefReference(item),
			),
		);
		const parsedReferencesWithoutIdentifier = manualResult
			.filter(
				(ref): ref is PromiseFulfilledResult<Zotero.Item> =>
					ref.status === "fulfilled",
			) // Only keep fulfilled promises
			.map((ref) => ref.value); // Extract the `value` from fulfilled promises;
		//Zotero.debug(`Parsed ${parsedReferencesWithoutIdentifier.length} references without identifier`);
		parsedReferences.push(...parsedReferencesWithoutIdentifier);

		//Zotero.debug(`Got ${parsedReferences.length} refs`);
		return parsedReferences;
	}

	/**
	 * Get a Zotero Item from a Crossref reference item that doesn't include an identifier.
	 * @param {string} crossrefItem - A reference item in JSON Crossref format.
	 * @returns {Promise<Zotero.Item>} Zotero item parsed from the identifier, or null if parsing failed.
	 */
	static async parseItemFromCrossrefReference(
		crossrefItem: string,
	): Promise<Zotero.Item> {
		//Zotero.log(`Parsing ${crossrefItem.unstructured}`);
		const jsonItem = {};
		if (crossrefItem["journal-title"]) {
			jsonItem.itemType = "journalArticle";
			jsonItem.title =
				crossrefItem["article-title"] || crossrefItem["volume-title"];
		} else if (crossrefItem["volume-title"]) {
			jsonItem.itemType = "book";
			jsonItem.title = crossrefItem["volume-title"];
		} else if (crossrefItem.unstructured) {
			// todo: Implement reference text parsing here
			throw new Error(
				"Couldn't parse Crossref reference - unstructured references are not yet supported. " +
					JSON.stringify(crossrefItem),
			);
		} else {
			throw new Error(
				"Couldn't determine type of Crossref reference - doesn't contain `journal-title` or `volume-title` field. " +
					JSON.stringify(crossrefItem),
			);
		}
		jsonItem.date = crossrefItem.year;
		jsonItem.pages = crossrefItem["first-page"];
		jsonItem.volume = crossrefItem.volume;
		jsonItem.issue = crossrefItem.issue;
		jsonItem.creators = [
			{
				creatorType: "author",
				name: crossrefItem.author,
			},
		];
		// remove undefined properties
		for (const key in jsonItem) {
			if (jsonItem[key] === undefined) {
				delete jsonItem[key];
			}
		}

		const newItem = new Zotero.Item(jsonItem.itemType);
		newItem.fromJSON(jsonItem);
		return newItem;
	}
}
