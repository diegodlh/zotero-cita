import { IndexerBase, IndexedWork, LookupIdentifier } from "./indexer";
import ItemWrapper from "./itemWrapper";
import Wikicite, { debug } from "./wikicite";
import Lookup from "./zotLookup";

interface CrossrefResponse {
	status: string;
	"message-type": string;
	"message-version": string;
	message: CrossrefWork;
}

interface CrossrefWork {
	"reference-count": number;
	reference: Reference[];
	"references-count": number;
}

interface Reference {
	key: string;
	issn?: string;
	"standards-body"?: string;
	"series-title"?: string;
	"isbn-type"?: string;
	"doi-asserted-by"?: string;
	DOI?: string;
	ISBN?: string;
	component?: string;
	"article-title"?: string;
	"volume-title"?: string;
	author?: string;
	year?: string;
	unstructured?: string;
	issue?: string;
	"first-page"?: string;
	volume?: string;
	"journal-title"?: string;
	edition?: string;
	"standard-designator"?: string;
	"issn-type"?: string;
}

function mapCrossrefWorkToIndexedWork(
	work: CrossrefWork,
): IndexedWork<Reference> {
	return {
		referenceCount: work["reference-count"], // Map Crossref's `reference-count` to `IndexedWork`'s `referenceCount`
		referencedWorks: work.reference, // Map `reference` to `referencedWorks`
	};
}

export default class Crossref extends IndexerBase<Reference> {
	indexerName = "Crossref";

	supportedPIDs: PIDType[] = ["DOI"];

	maxRPS: number = 50; // Requests per second

	async fetchDOI(item: ItemWrapper): Promise<LookupIdentifier | null> {
		const crossrefOpenURL =
			"https://doi.crossref.org/openurl?pid=cita@duck.com&";
		const ctx = Zotero.OpenURL.createContextObject(item, "1.0");

		if (ctx) {
			const url = crossrefOpenURL + ctx + "&multihit=true";
			const response = await Zotero.HTTP.request("GET", url).catch(
				(e) => {
					debug(
						`Couldn't access URL: ${url}. Got status ${e.status}.`,
					);
				},
			);

			const xml = response?.responseXML;

			if (xml) {
				const status = xml
					.getElementsByTagName("query")[0]
					.getAttribute("status");
				switch (status) {
					case "resolved":
					case "multiresolved": {
						// We just take the first one
						const doi =
							xml.getElementsByTagName("doi")[0].textContent;
						if (doi) return { type: "DOI", id: doi };
						break;
					}
					case "unresolved":
						return null;
					default:
						throw new Error(`Unexpected status: ${status}`);
				}
			}
		}
		return null;
	}

	/**
	 * Get a list of references from Crossref for an item with a certain DOI.
	 * Returned in JSON Crossref format.
	 * @param {string[]} identifiers - DOI for the item for which to get references.
	 * @returns {Promise<IndexedWork<Reference>[]>} list of references, or [] if none.
	 */
	async getReferences(
		identifiers: LookupIdentifier[],
	): Promise<IndexedWork<Reference>[]> {
		// Crossref-specific logic for fetching references
		const requests = identifiers.map(async (doi) => {
			const url = `https://api.crossref.org/works/${Zotero.Utilities.cleanDOI(doi.id)}`;
			const options = {
				headers: {
					"User-Agent": `${Wikicite.getUserAgent()} mailto:cita@duck.com`,
				},
				responseType: "json",
			};
			const response = await Zotero.HTTP.request(
				"GET",
				url,
				options,
			).catch((e) => {
				debug(`Couldn't access URL: ${url}. Got status ${e.status}.`);
				if (e.status == 429) {
					// Extract rate limit headers
					const rateLimitLimit =
						e.xmlhttp.getResponseHeader("X-Rate-Limit-Limit");
					const rateLimitInterval = e.xmlhttp.getResponseHeader(
						"X-Rate-Limit-Interval",
					);

					throw new Error(
						"Received a 429 rate limit response from Crossref (https://github.com/CrossRef/rest-api-doc#rate-limits). Try getting references for fewer items at a time. Rate limits in action: Limit: ${rateLimitLimit}, Interval: ${rateLimitInterval}",
					);
				}
			});

			const crossrefWork = (response?.response as CrossrefResponse)
				.message;
			return mapCrossrefWorkToIndexedWork(crossrefWork); // Map to IndexedWork<Reference>
		});
		return Promise.all(requests);
	}

	/**
	 * Parse a list of references in JSON Crossref format.
	 * @param {Reference[]} references - Array of Crossref references to parse to Zotero items.
	 * @returns {Promise<Zotero.Item[]>} Zotero items parsed from references (where parsing is possible).
	 */
	async parseReferences(references: Reference[]): Promise<Zotero.Item[]> {
		// Crossref-specific parsing logic
		// Extract one identifier per reference (prioritising DOI) and filter out those without identifiers
		const _identifiers = references
			.map((ref) => ref.DOI ?? ref.ISBN ?? null)
			.filter((e) => e !== null);
		// Remove duplicates and extract identifiers
		const identifiers = [...new Set(_identifiers)].flatMap((e) =>
			Zotero.Utilities.extractIdentifiers(e!),
		);
		const crossrefReferencesWithoutIdentifier = references.filter(
			(item) => !item.DOI && !item.ISBN,
		);

		// Use Lookup to get items for all identifiers
		const result = await Lookup.lookupItemsByIdentifiers(identifiers);
		const parsedReferences = result ? result : [];

		// Manually create items for references without identifiers
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
		parsedReferences.push(...parsedReferencesWithoutIdentifier);

		return parsedReferences;
	}

	/**
	 * Create a Zotero Item from a Crossref reference item that doesn't include an identifier.
	 * @param {Reference} crossrefItem - A reference item in JSON Crossref format.
	 * @returns {Promise<Zotero.Item>} Zotero item parsed from the identifier, or null if parsing failed.
	 */
	async parseItemFromCrossrefReference(
		crossrefItem: Reference,
	): Promise<Zotero.Item> {
		//Zotero.log(`Parsing ${crossrefItem.unstructured}`);
		const jsonItem: any = {};
		if (crossrefItem["journal-title"]) {
			jsonItem.itemType = "journalArticle";
			jsonItem.title =
				crossrefItem["article-title"] || crossrefItem["volume-title"];
			jsonItem.publicationTitle = crossrefItem["journal-title"];
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
		jsonItem.creators = crossrefItem.author
			? [Zotero.Utilities.cleanAuthor(crossrefItem.author, "author")]
			: [];
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
