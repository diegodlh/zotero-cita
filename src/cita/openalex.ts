import { IndexedWork, IndexerBase, ParsableReference } from "./indexer";
import OpenAlexSDK from "openalex-sdk";
import {
	ExternalIdsWork,
	SearchParameters,
	Work,
} from "openalex-sdk/dist/src/types/work";
import ItemWrapper from "./itemWrapper";
import PID from "./PID";
import Bottleneck from "bottleneck";

export default class OpenAlex extends IndexerBase<string> {
	indexerName = "OpenAlex";
	indexerPID: PIDType = "OpenAlex";

	openAlexSDK = new OpenAlexSDK("cita@duck.com");

	supportedPIDs: PIDType[] = [
		"OpenAlex",
		"DOI",
		"MAG",
		"PMID",
		"PMCID",
		"arXiv",
	];

	limiter = new Bottleneck({
		maxConcurrent: 5,
		minTime: 1000 / 10, // 10 requests per second
	});

	requiresGroupedIdentifiers: boolean = true;
	preferredChunkSize: number = 90;

	async fetchPIDs(item: ItemWrapper): Promise<PID[] | null> {
		let identifier = item.getBestPID(this.supportedPIDs);

		if (identifier && identifier.type === "arXiv") {
			identifier = new PID("DOI", `10.48550/arXiv.${identifier.cleanID}`);
		}

		let indexedWork: IndexedWork<string> | null = null;
		if (identifier) {
			const work = await this.limiter.schedule(() =>
				this.openAlexSDK.work(
					identifier.id,
					identifier.type.toLowerCase() as ExternalIdsWork,
				),
			);
			indexedWork = OpenAlex.mapWorkToIndexedWork(work);
		} else {
			// We use search with selection
			indexedWork = await this.searchIndexedWork(item, true);
		}

		return indexedWork?.identifiers || null;
	}

	async searchIndexedWork(
		item: ItemWrapper,
		allowSelection: boolean,
	): Promise<IndexedWork<string> | null> {
		if (!item.title) return null;
		const works = await this.limiter.schedule(() =>
			this.openAlexSDK.works({
				searchField: "title",
				search: encodeURIComponent(item.title),
				perPage: 10,
				retriveAllPages: false,
			}),
		);

		if (works.results.length === 1) {
			const work = works.results[0];
			return {
				references: work.referenced_works
					? OpenAlex.mapReferences(work.referenced_works)
					: [],
				identifiers: OpenAlex.mapWorkToIdentifiers(work),
				primaryID: work.id,
			};
		} else if (works.results.length > 1 && allowSelection) {
			// Multiple matches found, ask user to select
			const choices = works.results.map((work) => {
				const authors = work.authorships
					?.map((author) => author.raw_author_name)
					.join(", ");
				return `${work.display_name} - ${authors}`;
			});
			const selected: { value: number } = { value: 0 };
			const result = Services.prompt.select(
				window as mozIDOMWindowProxy,
				"Multiple matches found",
				"Select the item most closely matching",
				choices,
				selected,
			);
			if (result) {
				const work = works.results[selected.value];
				return OpenAlex.mapWorkToIndexedWork(work);
			}
		} else if (works.results.length > 1 && !allowSelection) {
			Zotero.log(`Multiple matches found for ${item.title}, skipping`);
		}

		return null;
	}

	/**
	 * Get references from OpenAlex for items with DOIs.
	 * @param {SupportedUID[]} identifiers - Array of DOIs or other identifiers for which to get references.
	 * @returns {Promise<IndexedWork<string>[]>} list of references, or [] if none.
	 */
	async getIndexedWorks(identifiers: PID[]): Promise<IndexedWork<string>[]> {
		const pidType = identifiers[0].type; // Should all be the same per chunk
		let searchParams: SearchParameters;
		if (pidType === "DOI") {
			const dois = identifiers.map((id) => id.id);
			searchParams = {
				filter: { doi: dois },
				retriveAllPages: true,
			};
		} else if (pidType === "arXiv") {
			const dois = identifiers.map(
				(id) => `10.48550/arXiv.${id.cleanID}`,
			);
			searchParams = {
				filter: { doi: dois },
				retriveAllPages: true,
			};
		} else {
			const otherIDs = identifiers.map((id) => {
				return { [id.type.toLowerCase()]: id.id };
			});
			searchParams = {
				filter: { ids: otherIDs },
				retriveAllPages: true,
			};
		}

		const works = (
			await this.limiter.schedule(() =>
				this.openAlexSDK.works(searchParams),
			)
		).results;
		return works.map(OpenAlex.mapWorkToIndexedWork);
	}

	private static mapWorkToIndexedWork(work: Work): IndexedWork<string> {
		return {
			references: work.referenced_works
				? // Filter out self-references (very rare, but here's an example: https://api.openalex.org/works/W2963003673)
					OpenAlex.mapReferences(work.referenced_works).filter(
						(ref) => ref.primaryID !== work.id,
					)
				: [],
			identifiers: OpenAlex.mapWorkToIdentifiers(work),
			primaryID: work.id,
		};
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
	private static mapWorkToIdentifiers(work: Work): PID[] {
		const pids: PID[] = [];
		if (work.doi) {
			pids.push(new PID("DOI", work.doi));
			if (work.doi.startsWith("https://doi.org/10.48550/arxiv."))
				pids.push(
					new PID(
						"arXiv",
						work.doi.replace("https://doi.org/10.48550/arxiv.", ""),
					),
				);
		}
		if (work.ids?.pmid) pids.push(new PID("PMID", `${work.ids.pmid}`));
		if (work.ids?.mag) pids.push(new PID("MAG", `${work.ids.mag}`));
		if (work.ids?.openalex)
			pids.push(new PID("OpenAlex", work.ids.openalex));
		return pids;
	}
}
