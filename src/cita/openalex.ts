import { IndexedWork, IndexerBase } from "./indexer";
import Lookup from "./zotLookup";
import OpenAlexSDK from "openalex-sdk";
import Wikicite, { debug } from "./wikicite";
import { SearchParameters, Work } from "openalex-sdk/dist/src/types/work";
import SourceItemWrapper from "./sourceItemWrapper";

type SupportedUID =
	| { DOI: string }
	| { openAlex: string }
	| { PMID: string }
	| { PMCID: string };

type SearchIds = {
	pmcid?: string;
	pmid?: string;
	openalex?: string;
	mag?: string;
};

export default class OpenAlex extends IndexerBase<string, SupportedUID> {
	indexerName = "Open Alex";

	openAlexSDK = new OpenAlexSDK("cita@duck.com");

	extractSupportedUID(item: SourceItemWrapper): SupportedUID | null {
		// DOI
		if (item.doi) return { DOI: item.doi };

		// OpenAlex
		if (item.getPID("OpenAlex"))
			return { openAlex: item.getPID("OpenAlex")! };

		// PMID
		const PMID = Wikicite.getExtraField(item.item, "PMID").values[0];
		if (PMID) return { PMID };

		// PMCID
		const PMCID = Wikicite.getExtraField(item.item, "PMCID").values[0];
		if (PMCID) return { PMCID };

		return null;
	}

	/**
	 * Get references from OpenAlex for items with DOIs.
	 * @param {SupportedUID[]} identifiers - Array of DOIs or other identifiers for which to get references.
	 * @returns {Promise<IndexedWork<string>[]>} list of references, or [] if none.
	 */
	async getReferences(
		identifiers: SupportedUID[],
	): Promise<IndexedWork<string>[]> {
		const dois = identifiers
			.filter((id): id is { DOI: string } => "DOI" in id)
			.map((id) => id.DOI);
		const oaIds = identifiers
			.filter((id): id is { openAlex: string } => "openAlex" in id)
			.map((id) => {
				return { openalex: id.openAlex };
			});
		// TODO: add PMID and PMCID support
		const doiParams: SearchParameters = {
			filter: { doi: dois },
		};
		const oaParams: SearchParameters = {
			filter: { ids: oaIds },
		};
		const works: Work[] = [];
		if (dois.length)
			works.push(...(await this.openAlexSDK.works(doiParams)).results);
		if (oaIds.length)
			works.push(...(await this.openAlexSDK.works(oaParams)).results);
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
