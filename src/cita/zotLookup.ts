import Bottleneck from "bottleneck";
import OpenAlex from "openalex-sdk";
import { SearchParameters } from "openalex-sdk/dist/src/types/work";
import PID from "./PID";
import Wikicite from "./wikicite";
import ItemWrapper from "./itemWrapper";

const limiter = new Bottleneck({
	minTime: 100, // Max 10 requests per second to avoid overloading translators
});

export default class Lookup {
	/**
	 * Look up items by identifiers. This code is adapted from Zotero's chrome/content/zotero/lookup.js.
	 * @param identifiers An array of PIDs. Supported types are DOI, PMID, arXiv, ISBN.
	 * @param addToZotero Whether to add the found items to Zotero.
	 * @returns The found items, or false if none were found.
	 */
	static async lookupItemsByIdentifiers(
		identifiers: PID[],
		addToZotero: boolean = false,
	): Promise<false | Zotero.Item[]> {
		if (!identifiers.length) {
			Zotero.logError(
				new Error(
					`Lookup input did not contain any identifiers ${JSON.stringify(identifiers)}`,
				),
			);
			return false;
		}

		let libraryID: false | number = false;
		let collections: false | number[] = false;

		if (addToZotero) {
			try {
				libraryID = ZoteroPane.getSelectedLibraryID();
				const collection = ZoteroPane.getSelectedCollection();
				collections = collection ? [collection.id] : false; // TODO: this should be selected by user
			} catch (e) {
				/* TODO: handle this */
			}
		}

		const promises: Promise<ZoteroTranslators.Item[]>[] = [];

		for (const identifier of identifiers) {
			if (
				!["DOI", "PMID", "arXiv", "ISBN"].includes(identifier.type) ||
				!identifier.zoteroIdentifier
			) {
				// Skip unsupported identifiers
				promises.push(Promise.resolve([]));
				continue;
			}

			const translate = new Zotero.Translate.Search();
			translate.setIdentifier(identifier.zoteroIdentifier!);

			// be lenient about translators
			const translators = await translate.getTranslators();
			translate.setTranslator(translators);

			// Schedule the translation request with the rate limiter
			const translationPromise: Promise<ZoteroTranslators.Item[]> =
				limiter
					.schedule(
						async () =>
							translate.translate({
								libraryID: libraryID,
								collections: collections,
								saveAttachments: addToZotero,
							}) as Promise<ZoteroTranslators.Item[]>, // Note that translate returns a serialized version of the item, not a Zotero.Item
					)
					.then(
						(
							result: ZoteroTranslators.Item[] | null,
						): ZoteroTranslators.Item[] => {
							// If null is returned, treat it as an empty array to match ZoteroTranslators.Item[]
							Zotero.debug(
								`Found item for identifier ${JSON.stringify(identifier)}: ${result}`,
							);
							return result || [];
						},
					)
					.catch((e): ZoteroTranslators.Item[] => {
						Zotero.logError(e);
						Zotero.log(
							`While looking for identifiers: ${JSON.stringify(identifier)}`,
						);
						return [];
					});

			promises.push(translationPromise);
		}

		// Wait for all translations to complete
		const results = await Promise.all(promises);

		// Flatten the results and push only the first item from each result (or none if it's empty), cleaning it up if needed
		const newItems = results.flatMap((result) => {
			if (result.length > 0 && result[0]) {
				const firstItem = result[0];
				if (!addToZotero) {
					// delete irrelevant fields to avoid warnings in Item#fromJSON
					delete firstItem.notes;
					delete firstItem.seeAlso;
					delete firstItem.attachments;
				}
				const newItem = new Zotero.Item(firstItem.itemType);
				newItem.fromJSON(firstItem);
				return newItem;
			} else return [];
		});

		//toggleProgress(false);
		if (!newItems.length) {
			Zotero.alert(
				window,
				Zotero.getString("lookup.failure.title"),
				Zotero.getString("lookup.failure.description"),
			);
		}
		// TODO: Give indication if some, but not all failed

		return newItems;
	}

	/**
	 * Look up items by OpenAlex identifiers.
	 * @param identifiers An array of OpenAlex or MAG identifiers. Thes must all be of the same type.
	 * @param addToZotero Whether to add the found items to Zotero.
	 * @returns The found items, or false if none were found.
	 */
	static async lookupItemsOpenAlex(
		identifiers: PID[],
		type: PIDType = "OpenAlex",
		addToZotero: boolean = false,
	): Promise<false | Zotero.Item[]> {
		if (!identifiers.length) {
			Zotero.logError(
				new Error(
					`OpenAlex lookup input did not contain any identifiers ${JSON.stringify(identifiers)}`,
				),
			);
			return false;
		}

		if (type !== "OpenAlex" && type !== "MAG") {
			Zotero.logError(
				new Error(
					`Unsupported identifier type ${type} for OpenAlex lookup`,
				),
			);
			return false;
		}

		if (identifiers.some((id) => id.type !== type)) {
			Zotero.logError(
				new Error(
					`Mismatched identifier types for OpenAlex lookup ${JSON.stringify(identifiers)}`,
				),
			);
			return false;
		}

		let libraryID: false | number = false;
		let collections: false | number[] = false;

		if (addToZotero) {
			try {
				libraryID = ZoteroPane.getSelectedLibraryID();
				const collection = ZoteroPane.getSelectedCollection();
				collections = collection ? [collection.id] : false; // TODO: this should be selected by user
			} catch (e) {
				/* TODO: handle this */
			}
		}

		// Taken from the OpenAlex search translator
		//const apiURL = `https://api.openalex.org/works?filter=openalex:${identifiers.join("|")}&mailto=cita@duck.com`;
		// Z.debug(apiURL);
		//const apiJSON = (await Zotero.HTTP.request("GET", apiURL)).responseText;
		const sdk = new OpenAlex("cita@duck.com");
		const ids: ({ openalex: string } | { mag: string })[] = identifiers.map(
			(pid) => {
				return type === "OpenAlex"
					? { openalex: pid.id }
					: { mag: pid.id };
			},
		);
		const params: SearchParameters = {
			filter: {
				ids: ids,
			},
		};
		const works = await sdk.works(params);

		// We have to tweak the JSON a bit to favor DOI imports and reserve the (potentially failing) OpenAlex JSON translator to whatever remains
		const dois = works.results
			.map((work) => work.doi ?? null)
			.filter((e) => e !== null)
			.flatMap((e) => new PID("DOI", e!));
		const newItems = dois.length
			? (await this.lookupItemsByIdentifiers(dois, addToZotero)) || []
			: [];

		// Filter out
		works.results = works.results.filter((work) => !work.doi);
		works.meta.count = works.results.length;
		const apiJSON = JSON.stringify(works);
		const translator = new Zotero.Translate.Import(); // as ZoteroTranslators.Translate<ZoteroTranslators.ImportTranslator>;
		translator.setTranslator("faa53754-fb55-4658-9094-ae8a7e0409a2"); // OpenAlex JSON
		translator.setString(apiJSON);
		const promise = translator.translate({
			libraryID: libraryID,
			collections: collections,
			saveAttachments: addToZotero,
		}) as Promise<ZoteroTranslators.Item[]>;
		const results = await promise.catch((e): ZoteroTranslators.Item[] => {
			Zotero.logError(e);
			Zotero.log(
				`While looking for OpenAlex items: ${JSON.stringify(identifiers)}`,
			);
			return [];
		});

		// Flatten the results and push only the first item from each result (or none if it's empty), cleaning it up if needed
		const oaItems = results.map((result) => {
			if (!addToZotero) {
				// delete irrelevant fields to avoid warnings in Item#fromJSON
				delete result.notes;
				delete result.seeAlso;
				delete result.attachments;
			}
			const newItem = new Zotero.Item(result.itemType);
			newItem.fromJSON(result);
			// Cleanup OpenAlex identifier since the translator saves the url
			const wrapper = new ItemWrapper(newItem);
			const pid = wrapper.getPID("OpenAlex");
			if (pid && pid.cleanID)
				wrapper.setPID("OpenAlex", pid.cleanID, false);
			return newItem;
		});

		newItems.push(...oaItems);

		//toggleProgress(false);
		if (!newItems.length) {
			Zotero.alert(
				window,
				Zotero.getString("lookup.failure.title"),
				Zotero.getString("lookup.failure.description"),
			);
		}
		// TODO: Give indication if some, but not all failed

		return newItems;
	}
}
