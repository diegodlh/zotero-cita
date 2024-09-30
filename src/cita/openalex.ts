import { IndexedWork, IndexerBase } from "./indexer";
import Lookup from "./zotLookup";
import OpenAlexSDK from "openalex-sdk";
import { debug } from "./wikicite";
import { SearchParameters, Works } from "openalex-sdk/dist/src/types/work";

export default class OpenAlex extends IndexerBase<string> {
	indexerName = "Open Alex";

	openAlexSDK = new OpenAlexSDK("cita@duck.com");

	/**
	 * Get references from OpenAlex for items with DOIs.
	 * @param {string[]} identifiers - Array of DOIs or other identifiers for which to get references.
	 * @returns {Promise<IndexedWork<string>[]>} list of references, or [] if none.
	 */
	async getReferences(identifiers: string[]): Promise<IndexedWork<string>[]> {
		const params: SearchParameters = {
			filter: { doi: identifiers },
		};
		const works = (await this.openAlexSDK.works(params)).results;
		return works.map((work): IndexedWork<string> => {
			return {
				referenceCount: work.referenced_works?.length ?? 0,
				referencedWorks: work.referenced_works ?? [],
			};
		});
	}

	/**
	 * Parse a list of works from OpenAlex into Zotero items.
	 * @param {string[]} works - Array of works from OpenAlex to parse.
	 * @returns {Promise<Zotero.Item[]>} Zotero items parsed from the works.
	 */
	async parseReferences(works: string[]): Promise<Zotero.Item[]> {
		if (!works.length) {
			debug("Item found on OpenAlex but doesn't contain any references");
			return [];
		}

		// Use Lookup to get items from OpenAlex
		const uniqueWorks = [...new Set(works)];
		const result = await Lookup.lookupItemsOpenAlex(uniqueWorks);
		const parsedReferences = result ? result : [];
		return parsedReferences;
	}
}
