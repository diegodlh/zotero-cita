import { IndexedWork, IndexerBase, ParsableReference } from "./indexer";
import OpenAlexSDK from "openalex-sdk";
import {
	ExternalIdsWork,
	SearchParameters,
	Work,
} from "openalex-sdk/dist/src/types/work";
import ItemWrapper from "./itemWrapper";
import PID from "./PID";

export default class OpenAlex extends IndexerBase<string> {
	indexerName = "OpenAlex";

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
		// TODO: limit number of works to fetch at once due to request string length
		if (dois.length)
			works.push(...(await this.openAlexSDK.works(doiParams)).results);
		if (oaIds.length)
			works.push(...(await this.openAlexSDK.works(oaParams)).results);
		return works.map((work): IndexedWork<string> => {
			return {
				references: work.referenced_works
					? OpenAlex.mapReferences(work.referenced_works)
					: [],
				identifiers: OpenAlex.mapIdentifiers(work),
				primaryID: work.id,
			};
		});
	}

	private static mapReferences(
		references: string[],
	): ParsableReference<string>[] {
		// The references are just OpenAlex URLs
		return references.map((ref) => {
			return {
				primaryID: ref,
				externalIds: [new PID("OpenAlex", ref)],
				rawObject: ref,
			};
		});
	}

	/**
	 * Map OpenAlex work to PIDs.
	 * @param {Work} work - OpenAlex work to map.
	 * @returns {PID[]} PIDs mapped from the work.
	 */
	private static mapIdentifiers(work: Work): PID[] {
		const pids: PID[] = [];
		if (work.doi) pids.push(new PID("DOI", work.doi));
		if (work.ids?.pmid) pids.push(new PID("PMID", `${work.ids.pmid}`));
		if (work.ids?.mag) pids.push(new PID("MAG", `${work.ids.mag}`));
		if (work.ids?.openalex)
			pids.push(new PID("OpenAlex", work.ids.openalex));
		return pids;
	}
}
