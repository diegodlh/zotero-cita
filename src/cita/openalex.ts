import { IndexedWork, IndexerBase, LookupIdentifier } from "./indexer";
import Lookup from "./zotLookup";
import OpenAlexSDK from "openalex-sdk";
import Wikicite, { debug } from "./wikicite";
import {
	ExternalIdsWork,
	SearchParameters,
	Work,
} from "openalex-sdk/dist/src/types/work";
import ItemWrapper from "./itemWrapper";

export default class OpenAlex extends IndexerBase<string> {
	indexerName = "Open Alex";

	openAlexSDK = new OpenAlexSDK("cita@duck.com");

	supportedPIDs: PIDType[] = ["DOI", "OpenAlex", "PMID", "PMCID"];

	async fetchPIDs(item: ItemWrapper): Promise<LookupIdentifier[] | null> {
		// TODO: support getting for multiple items
		const metatdataPIDs: PIDType[] = ["DOI", "PMID", "PMCID", "OpenAlex"];
		let identifier: LookupIdentifier | null = null;
		for (const pid of metatdataPIDs) {
			const value = item.getPID(pid, true); // Already clean them up
			if (value) identifier = { type: pid, id: value };
		}

		if (identifier) {
			const work = await this.openAlexSDK.work(
				identifier.id,
				identifier.type.toLowerCase() as ExternalIdsWork,
			);
			const cleaned = work.id.replace(/https?:\/\/openalex.org\//, "");
			const pids: LookupIdentifier[] = [
				{ type: "OpenAlex", id: cleaned },
			];
			// We don't add MAG because it's basically the same as OpenAlex
			if (work.doi) pids.push({ type: "DOI", id: work.doi });
			if (work.ids?.pmid) pids.push({ type: "PMID", id: work.ids.pmid });
			return pids;
		}

		return null;
	}

	/**
	 * Get references from OpenAlex for items with DOIs.
	 * @param {SupportedUID[]} identifiers - Array of DOIs or other identifiers for which to get references.
	 * @returns {Promise<IndexedWork<string>[]>} list of references, or [] if none.
	 */
	async getReferences(
		identifiers: LookupIdentifier[],
	): Promise<IndexedWork<string>[]> {
		const dois = identifiers
			.filter((id) => id.type === "DOI")
			.map((id) => id.id);
		const oaIds = identifiers
			.filter((id) => id.type === "OpenAlex")
			.map((id) => {
				return { openalex: id.id };
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
