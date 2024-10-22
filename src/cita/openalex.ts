import { IndexedWork, IndexerBase } from "./indexer";
import Lookup from "./zotLookup";
import OpenAlexSDK from "openalex-sdk";
import Wikicite, { debug } from "./wikicite";
import {
	ExternalIdsWork,
	SearchParameters,
	Work,
} from "openalex-sdk/dist/src/types/work";
import ItemWrapper from "./itemWrapper";
import PID from "./PID";

export default class OpenAlex extends IndexerBase<string> {
	indexerName = "Open Alex";

	openAlexSDK = new OpenAlexSDK("cita@duck.com");

	supportedPIDs: PIDType[] = ["OpenAlex", "DOI", "MAG", "PMID", "PMCID"];

	async fetchPIDs(item: ItemWrapper): Promise<PID[] | null> {
		// TODO: support getting for multiple items
		const identifier = item.getBestPID(this.supportedPIDs);

		if (identifier) {
			const work = await this.openAlexSDK.work(
				identifier.id,
				identifier.type.toLowerCase() as ExternalIdsWork,
			);
			const cleaned = work.id.replace(/https?:\/\/openalex.org\//, "");
			const pids: PID[] = [new PID("OpenAlex", cleaned)];
			if (work.doi) pids.push(new PID("DOI", work.doi));
			if (work.ids?.pmid) pids.push(new PID("PMID", `${work.ids.pmid}`));
			if (work.ids?.mag) pids.push(new PID("MAG", `${work.ids.mag}`));
			return pids;
		}

		return null;
	}

	/**
	 * Get references from OpenAlex for items with DOIs.
	 * @param {SupportedUID[]} identifiers - Array of DOIs or other identifiers for which to get references.
	 * @returns {Promise<IndexedWork<string>[]>} list of references, or [] if none.
	 */
	async getIndexedWorks(identifiers: PID[]): Promise<IndexedWork<string>[]> {
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
			retriveAllPages: true,
		};
		const oaParams: SearchParameters = {
			filter: { ids: oaIds },
			retriveAllPages: true,
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
				identifiers: this.mapIdentifiers(work),
			};
		});
	}

	/**
	 * Map OpenAlex work to PIDs.
	 * @param {Work} work - OpenAlex work to map.
	 * @returns {PID[]} PIDs mapped from the work.
	 */
	mapIdentifiers(work: Work): PID[] {
		const pids: PID[] = [];
		if (work.doi) pids.push(new PID("DOI", work.doi));
		if (work.ids?.pmid) pids.push(new PID("PMID", `${work.ids.pmid}`));
		if (work.ids?.mag) pids.push(new PID("MAG", `${work.ids.mag}`));
		if (work.ids?.openalex)
			pids.push(new PID("OpenAlex", work.ids.openalex));
		return pids;
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
		const uniqueWorks = [...new Set(works)].map(
			(id) => new PID("OpenAlex", id),
		);
		const result = await Lookup.lookupItemsOpenAlex(uniqueWorks);
		const parsedReferences = result ? result : [];
		return parsedReferences;
	}
}
