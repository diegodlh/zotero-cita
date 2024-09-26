import Bottleneck from "bottleneck";
import OpenAlex from "openalex-sdk";
import { SearchParameters } from "openalex-sdk/dist/src/types/work";

const limiter = new Bottleneck({
	minTime: 100, // Max 10 requests per second to avoid overloading translators
});

export default class Lookup {
	// This code is adapted from Zotero's chrome/content/zotero/lookup.js
	static async lookupItemsByIdentifiers(
		identifiers: (
			| { DOI: string }
			| { ISBN: string }
			| { arXiv: string }
			| { adsBibcode: string }
			| { PMID: string }
		)[],
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

		//toggleProgress(true);

		// Group PubMed IDs into batches of 200
		//
		// Up to 10,000 ids can apparently be passed in a single request, but 200 is the recommended
		// limit for GET, which we currently use, and passing batches of 200 seems...fine.
		//
		// https://www.ncbi.nlm.nih.gov/books/NBK25499/#chapter4.id
		// TODO: this code was taken from chrome/content/zotero/lookup.js, which assumes that all identifiers are of the same type, yet we don't make that assumption and we also don't do batch requests
		/*if (identifiers.length && 'PMID' in identifiers[0]) {
			const chunkSize = 200;
			const newIdentifiers = [];
			for (let i = 0; i < identifiers.length; i += chunkSize) {
				newIdentifiers.push({
					PMID: identifiers
						.slice(i, i + chunkSize)
						.map((x) => x.PMID),
				});
			}
			identifiers = newIdentifiers;
		}*/

		const promises = [];

		for (const identifier of identifiers) {
			const translate = new Zotero.Translate.Search();
			translate.setIdentifier(identifier);

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

	static async lookupItemsOpenAlex(
		identifiers: string[],
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

		//const promises = [];

		// Taken from the OpenAlex search translator
		//const apiURL = `https://api.openalex.org/works?filter=openalex:${identifiers.join("|")}&mailto=cita@duck.com`;
		// Z.debug(apiURL);
		//const apiJSON = (await Zotero.HTTP.request("GET", apiURL)).responseText;
		const sdk = new OpenAlex("cita@duck.com");
		const oaIds: { openalex: string }[] = identifiers.map((id) => {
			return { openalex: id };
		});
		const params: SearchParameters = {
			filter: {
				ids: oaIds,
			},
		};
		const works = await sdk.works(params);

		// We have to tweak the JSON a bit to favor DOI imports and reserve the (potentially failing) OpenAlex JSON translator to whatever remains
		const dois = works.results
			.map((work) => work.doi ?? null)
			.filter((e) => e !== null)
			.flatMap((e) => Zotero.Utilities.extractIdentifiers(e!));
		const newItems =
			(await this.lookupItemsByIdentifiers(dois, addToZotero)) || [];

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
