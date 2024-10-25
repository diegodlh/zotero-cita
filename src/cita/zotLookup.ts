import Bottleneck from "bottleneck";
import OpenAlex from "openalex-sdk";
import { SearchParameters } from "openalex-sdk/dist/src/types/work";
import PID from "./PID";
import Wikicite from "./wikicite";
import ItemWrapper from "./itemWrapper";
import _ = require("lodash");
import { ParsableReference } from "./indexer";

interface TranslatedReference {
	/**
	 * The corresponding ParsableItems indexer-specific unique keys.
	 * @remarks We make the assumption that lookup is called with ParsableItems all coming from the same indexer, so that the primary key should provide a sufficient guarantee of a unique and exclusive set of PIDs.
	 */
	primaryID: string;
	item: ZoteroTranslators.Item;
}

export interface ParsedReference {
	/**
	 * The corresponding ParsableItem's indexer-specific unique keys.
	 * @remarks We make the assumption that lookup is called with ParsableItems all coming from the same indexer, so that the primary key should provide a sufficient guarantee of a unique and exclusive set of PIDs.
	 */
	primaryID: string;
	item: Zotero.Item;
}

export default class Lookup {
	static readonly pidsSupportedForLookup: PIDType[] = [
		"OpenAlex",
		"MAG",
		// DOI Content negotation probably provides the most reliable results, but is slow. We're not importing them into Zotero (yet), we're just getting the metadata as best as possible. Zotero will use DOI to fetch the item anyway on import.
		// TODO: maybe have a setting for "quality over quantity" once the fallback mechanism is in place?
		"DOI",
		"PMID",
		"arXiv",
		"ISBN",
	];

	/**
	 * Look up items by identifiers. This code is adapted from Zotero's chrome/content/zotero/lookup.js.
	 * @param identifiers An array of PIDs. Supported types are DOI, PMID, arXiv, ISBN.
	 * @param addToZotero Whether to add the found items to Zotero.
	 * @returns The found items, or false if none were found.
	 */
	static async lookupItemsByIdentifiers(
		identifiers: PID[],
		addToZotero: boolean = false,
		failedIdentifiersFallback?: (pids: PID[]) => void,
	): Promise<false | Zotero.Item[]> {
		const dummyItems = identifiers.map((pid) => {
			return {
				primaryID: pid.id,
				externalIds: [pid],
			};
		});

		// TODO: here, DOI and co should be privileged, Reset.

		const result = await Lookup.lookupItems(
			dummyItems,
			addToZotero,
			failedIdentifiersFallback,
		);

		if (!result) return false;

		return result.map((item) => item.item);
	}

	static async lookupItems(
		parsableItemsWithIDs: ParsableReference<any>[],
		addToZotero: boolean = false,
		failedIdentifiersFallback?: (pids: PID[]) => void,
	): Promise<false | ParsedReference[]> {
		if (!parsableItemsWithIDs.length) {
			Zotero.logError(
				new Error(`Lookup input did not contain any items to look up.`),
			);
			return false;
		}

		// Extract identifiers from references and group them by type
		const bestIdentifiers = parsableItemsWithIDs
			.map((item) => {
				// Create a map of externalIds for quick lookup by type
				const pidMap = new Map(
					item.externalIds.map((pid) => [pid.type, pid]),
				);

				// Iterate through pidsSupportedForLookup in order of priority and find the first match
				for (const type of Lookup.pidsSupportedForLookup) {
					const pid = pidMap.get(type);
					if (pid?.cleanID)
						return {
							primaryID: item.primaryID,
							pid: pid,
						};
				}
				// Caller must guarantee that all items have at least one supported identifier so a match is guaranteed to be found here.
				// So this should never happen:
				//throw new Error("No supported PID found");
				return null;
			})
			.filter((item) => item !== null) as {
			primaryID: string;
			pid: PID;
		}[];
		// We group the best identifiers by rawPID to avoid duplicate lookups and to allow for easy filtering of failed lookups
		const bestIdentifiersMap = _.groupBy(
			bestIdentifiers,
			(item) => item.pid.comparable,
		);

		const uniqueIdentifiers = _.uniqWith(bestIdentifiers, (a, b) =>
			PID.isEqual(a.pid, b.pid),
		);

		// Group identifiers by type
		const groupedIdentifiers = _.groupBy(
			uniqueIdentifiers,
			(id) => id.pid.type,
		);

		const counts = Object.entries(groupedIdentifiers)
			.map(([type, pids]) => `${pids.length} ${type} identifiers`)
			.join(", ");
		ztoolkit.log(`Looking up ${counts}`);

		let libraryID: false | number = false;
		let collections: number[] = [];

		if (addToZotero) {
			try {
				libraryID = ZoteroPane.getSelectedLibraryID();
				const collection = ZoteroPane.getSelectedCollection();
				collections = collection ? [collection.id] : []; // TODO: this should be selected by user
			} catch (e) {
				Zotero.logError(e as Error);
			}
		}

		const translationPromises: Promise<TranslatedReference[]>[] = [];
		const failedIdentifiers: PID[] = [];

		// Set up limiter to avoid rate limiting
		// TODO: adapt as best as possible to the type's expected translator
		// Crossref supports 50 RPS, max 5 concurrent
		// DataCite (vie DOI Content Negotiation) supports 1000 requests in a 5 minute window
		const limiter = new Bottleneck({
			maxConcurrent: 3,
			minTime: 300, //1000 * (1 / 40), // Max 50 requests per second
		});

		for (const [_type, pidsMap] of Object.entries(groupedIdentifiers)) {
			ztoolkit.log(`Looking up ${pidsMap.length} items of type ${_type}`);
			const type = _type as PIDType;
			const options: ZoteroTranslators.TranslateOptions = {
				libraryID: libraryID,
				collections: collections,
				saveAttachments: addToZotero,
			};
			switch (type) {
				case "OpenAlex":
				case "MAG":
					translationPromises.push(
						Lookup.createOpenAlexPromise(type, pidsMap, options),
					);
					break;
				default: {
					const promises = await Lookup.wrapSequentialTranslator(
						limiter,
						type,
						pidsMap,
						options,
					);
					translationPromises.push(...promises);
					break;
				}
			}
		}

		// Wait for all translations to complete
		const results = await Promise.allSettled(translationPromises);
		const [successfulResults, failedResults] = _.partition(
			results,
			(result) => result.status === "fulfilled",
		);

		// Flatten the results, cleaning them up if needed
		const newItems = (
			successfulResults as PromiseFulfilledResult<TranslatedReference[]>[]
		).flatMap((result) => {
			return result.value.map((parsedItem) => {
				if (!addToZotero) {
					// delete irrelevant fields to avoid warnings in Item#fromJSON
					delete parsedItem.item!.notes;
					delete parsedItem.item!.seeAlso;
					delete parsedItem.item!.attachments;
				}
				const newItem = new Zotero.Item(parsedItem.item!.itemType);
				newItem.fromJSON(parsedItem.item!);
				return {
					primaryID: parsedItem.primaryID,
					item: newItem,
				};
			});
		});

		// Log failed identifiers
		if (failedResults.length) {
			Zotero.log(
				`Failed to fetch items for ${failedResults.length} identifiers`,
			);
			for (const result of failedResults as PromiseRejectedResult[]) {
				Zotero.log(`Reason: ${result.reason}`);
			}
		}
		for (const result of failedResults as PromiseRejectedResult[]) {
			Zotero.log(`Reason: ${result.reason}`);
		}

		if (!newItems.length) {
			Zotero.alert(
				window,
				Zotero.getString("lookup.failure.title"),
				Zotero.getString("lookup.failure.description"),
			);
		}

		// TODO: Give indication if some, but not all failed

		failedIdentifiersFallback?.(failedIdentifiers);

		return newItems;
	}

	private static async wrapSequentialTranslator(
		limiter: Bottleneck,
		type: PIDType,
		pidsMap: { primaryID: string; pid: PID }[],
		options: ZoteroTranslators.TranslateOptions,
	): Promise<Promise<TranslatedReference[]>[]> {
		if (!pidsMap.length) {
			throw new Error("No PIDs provided");
		}

		// We the matching translators once and then use them for all PIDs, since they're guaranteed to be of the same type
		const dummyTranslator =
			new Zotero.Translate.Search() as ZoteroTranslators.Translate<ZoteroTranslators.SearchTranslator>;
		const firstPID = pidsMap[0].pid;
		const searchObject = { [firstPID.type]: firstPID.id };
		dummyTranslator.setSearch(searchObject as any);
		const searchTranslators = await dummyTranslator.getTranslators(); // Always returns all possible translators, regardless of arguments

		const promises = pidsMap.map(({ primaryID, pid }) =>
			limiter
				.schedule(() =>
					Lookup.createSearchPromise(pid, searchTranslators, options),
				)
				.then((items) => {
					return items.map((item) => {
						return { primaryID: primaryID, item };
					});
				}),
		);

		return promises;
	}

	private static createSearchPromise(
		pid: PID,
		translators: ZoteroTranslators.SearchTranslator[],
		options: ZoteroTranslators.TranslateOptions,
	): Promise<ZoteroTranslators.Item[]> {
		const translator =
			new Zotero.Translate.Search() as ZoteroTranslators.Translate<ZoteroTranslators.SearchTranslator>;
		translator.setTranslator(translators);
		const searchObject = { [pid.type]: pid.id };
		translator.setSearch(searchObject as any);

		// Errors caught with the error handler will still fail the promise
		translator.setHandler("error", (obj, error) => {
			Zotero.log(
				`Error during translation of single identifier: ${error}. Was looking for ${JSON.stringify(searchObject)}`,
			);
		});

		// Note that the itemDone handler should do something with the item, otherwise it will be silently ignored
		/*translator.setHandler("itemDone", (obj, item) => {
			Zotero.log(`Found item ${item.title}`);
		});*/
		/*translator.setHandler("debug", (obj, message) => {
			Zotero.log(`${JSON.stringify(searchObject)} onDebug: ${message}`);
			return true;
		});*/

		// Note that translate returns a serialized version of the item, not a Zotero.Item
		return translator.translate(options).catch((e) => {
			//Zotero.log(e);
			//Zotero.log(`While looking for identifier: ${JSON.stringify(pid)}`);
			// We should return or store the PID here so we know which item(s) failed
			return [];
		});
	}

	private static createOpenAlexPromise(
		type: PIDType,
		pidsMap: { primaryID: string; pid: PID }[],
		options: ZoteroTranslators.TranslateOptions,
	): Promise<TranslatedReference[]> {
		// We fetch the JSON ourselves instead of via the OpenAlex search translator (432d79fe-79e1-4791-b3e1-baf700710163) to better handle massive bulk requests
		const sdk = new OpenAlex("cita@duck.com");
		const ids: ({ openalex: string } | { mag: string })[] = pidsMap.map(
			(mapItem) => {
				return type === "OpenAlex"
					? { openalex: mapItem.pid.id }
					: { mag: mapItem.pid.id };
			},
		);
		// FIXME: seems to max out at around 95 items because the request itself becomes too large
		// TODO: implement chunking
		// We can theoretically fetch thousands of items at once, but we can have at most 100 filters in a single request. In addition, the URL length is limited, so considering that the filter includes the entire OpenAlex URL, we can fetch around 90 items at once.
		const params: SearchParameters = {
			filter: {
				ids: ids,
			},
			retriveAllPages: true,
		};
		const translationPromise = sdk.works(params).then((works) => {
			const apiJSON = JSON.stringify(works);
			const translator =
				new Zotero.Translate.Import() as ZoteroTranslators.Translate<ZoteroTranslators.ImportTranslator>;
			translator.setTranslator("faa53754-fb55-4658-9094-ae8a7e0409a2"); // OpenAlex JSON
			translator.setString(apiJSON);
			translator.setHandler("error", (obj, error) => {
				Zotero.log(error);
				Zotero.log(
					`While looking for ${type} items: ${JSON.stringify(pidsMap)}`,
				);
			});

			// Note that the itemDone handler should do something with the item, otherwise it will be silently ignored
			/*translator.setHandler("itemDone", (obj, item) => {
				Zotero.log(`Found item ${item.title}`);
			});
			translator.setHandler("debug", (obj, message) => {
				Zotero.log(message);
				return true;
			});*/

			return translator.translate(options);
		});

		return translationPromise.then((items) => {
			// FIXME: this is hacky
			const fieldName = "OpenAlex"; //type === "OpenAlex" ? "openalex" : "mag";
			const regex = new RegExp(`${fieldName}:\\s+(.+)`, "i");
			return items.map((item) => {
				// Get the new item's OpenAlex ID
				const _extraPID = item.extra?.match(regex)?.[1];
				// We pop the leading W in hopes that this is a valid MAG ID
				const extraPID = new PID(
					type,
					type === "MAG" ? _extraPID!.substring(1) : _extraPID!,
				);
				const matchingPrimaryID: string =
					pidsMap.find((mapItem) =>
						PID.isEqual(mapItem.pid, extraPID),
					)?.primaryID || "sorry"; // IDs get lost here when using MAG identifiers
				return { primaryID: matchingPrimaryID, item };
			});
		});

		// TODO: use OpenAlex as primary, DOI as fallback
		// We have to tweak the JSON a bit to favor DOI imports and reserve the (potentially failing) OpenAlex JSON translator to whatever remains
		/*const dois = works.results
			.map((work) => work.doi ?? null)
			.filter((e) => e !== null)
			.flatMap((e) => new PID("DOI", e!));
		const failedDOIs: PID[] = []; // We'll try those with the OpenAlex translator
		const newItems = dois.length
			? (await this.lookupItemsByIdentifiers(dois, addToZotero, (dois) =>
					failedDOIs.push(...dois),
				)) || []
			: [];*/

		// Filter out
		/*works.results = works.results.filter(
			(work) =>
				!work.doi || failedDOIs.some((pid) => pid.id === work.doi),
		);
		works.meta.count = works.results.length;*/
		/*const apiJSON = JSON.stringify(works);
		const translator =
			new Zotero.Translate.Import() as ZoteroTranslators.Translate<ZoteroTranslators.ImportTranslator>;
		translator.setTranslator("faa53754-fb55-4658-9094-ae8a7e0409a2"); // OpenAlex JSON
		translator.setString(apiJSON);
		const promise = translator.translate({
			libraryID: libraryID,
			collections: collections,
			saveAttachments: addToZotero,
		});
		const results = await promise.catch((e) => {
			Zotero.logError(e);
			Zotero.log(
				`While looking for OpenAlex items: ${JSON.stringify(identifiers)}`,
			);
			return [];
		});*/
	}
}
