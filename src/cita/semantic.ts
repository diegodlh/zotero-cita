import Wikicite from "./wikicite";
import { IndexedWork, IndexerBase, ParsableReference } from "./indexer";
import ItemWrapper from "./itemWrapper";
import * as prefs from "../cita/preferences";
import { getPref } from "../utils/prefs";
import PID from "./PID";
import Bottleneck from "bottleneck";

interface SemanticPaper {
	paperId: string;
	externalIds: ExternalIDS | null;
	title: string;
	references: Reference[];
}

interface Reference {
	paperId: null | string;
	externalIds: ExternalIDS | null;
	title: string;
	authors: Author[];
}

interface Author {
	authorId: null | string;
	name: string;
}

interface ExternalIDS {
	MAG?: string;
	DBLP?: string;
	CorpusId: number;
	DOI?: string;
	PubMed?: string;
	ArXiv?: string;
	ACL?: string;
	PubMedCentral?: string;
}

export default class Semantic extends IndexerBase<Reference> {
	indexerName = "Semantic Scholar";
	indexerPID: PIDType = "CorpusID";

	supportedPIDs: PIDType[] = [
		"CorpusID",
		"DOI",
		"arXiv",
		"MAG",
		"PMID",
		"PMCID",
		"OpenAlex", // Use as a last resort, they should be backwards compatible to MAG if the work existed in MAG
	];

	maxRPS: number = 1; // Request per second
	maxConcurrent: number = 1; // Maximum concurrent requests

	limiter = new Bottleneck({
		maxConcurrent: 1,
		minTime: 1100 / 1, // 1 request per 1.1 second (not strictly necessary due to the reservoir)

		// Allow max 1 request per 1 second window
		reservoir: 1,
		reservoirRefreshAmount: 1,
		reservoirRefreshInterval: 1100, // 1.1 second
	});

	preferredChunkSize: number = 100; // Could support up to 500 items, but only 9999 citations per request
	requiresGroupedIdentifiers: boolean = false;

	constructor() {
		super();
		this.limiter.on("failed", async (error, info) => {
			ztoolkit.log(`Request failed with error: ${error}`);
			ztoolkit.log(`Request failed with info: ${JSON.stringify(info)}`);
		});
		this.limiter.on("error", (error) => {
			ztoolkit.log(`Request error: ${error}`);
		});
		this.limiter.on("debug", (message) => {
			ztoolkit.log(`Request debug message: ${message}`);
		});
	}

	destructor() {
		this.limiter.stop();
		this.limiter.disconnect();
	}

	async fetchPIDs(item: ItemWrapper): Promise<PID[] | null> {
		const identifier = item.getBestPID(this.supportedPIDs);
		let work: IndexedWork<Reference> | null = null;

		if (identifier) {
			const url = `https://api.semanticscholar.org/graph/v1/paper/${Semantic.mapLookupIDToString(identifier)}?fields=externalIds`;
			const response = await this.makeRequest("GET", url);
			const paper = response?.response
				? (response?.response as SemanticPaper)
				: null;
			if (paper) {
				work = {
					references: [],
					identifiers: Semantic.mapIdentifiers(paper.externalIds),
					primaryID: paper.paperId,
				};
			}
		} else {
			// We use search
			work = await this.searchIndexedWork(item, true);
		}

		return work?.identifiers || null;
	}

	async searchIndexedWork(
		item: ItemWrapper,
		allowSelection: boolean,
	): Promise<IndexedWork<Reference> | null> {
		if (!item.title) return null;
		const url = `https://api.semanticscholar.org/graph/v1/paper/search/match?query=${encodeURIComponent(item.title)}`;
		const response = await this.makeRequest(
			"GET",
			url,
			undefined,
			`semantic-search-${item.title}`,
		);
		const paperMatch =
			response?.response?.data && Array.isArray(response.response.data)
				? (response.response.data as SemanticPaper[])[0]
				: null;
		if (paperMatch) {
			const paperId = paperMatch.paperId;
			const paperUrl = `https://api.semanticscholar.org/graph/v1/paper/${paperId}?fields=externalIds`;
			const paperResponse = await this.makeRequest(
				"GET",
				paperUrl,
				undefined,
				`semantic-paper-${paperId}`,
			);
			const paper = paperResponse?.response
				? (paperResponse?.response as SemanticPaper)
				: null;
			if (paper) {
				return {
					references: [],
					identifiers: Semantic.mapIdentifiers(paper.externalIds),
					primaryID: paper.paperId,
				};
			}
		}

		return null;
	}

	/**
	 * Get a list of references from Semantic Scholar for multiple DOIs at once.
	 * Returned in JSON Crossref format.
	 * @param {LookupIdentifier[]} identifiers - Identifier (DOI, etc.) for the item for which to get references.
	 * @returns {Promise<IndexedWork<Reference>[]>} list of references, or [] if none.
	 *
	 * @remarks	According to API reference, supports the following identifiers:
	 * The following types of IDs are supported (starred ones are supported here):
	 * - `<sha>` - a Semantic Scholar ID, e.g. 649def34f8be52c8b66281af98ae884c09aef38b
	 * - `CorpusId:<id>`* - a Semantic Scholar numerical ID, e.g. CorpusId:215416146
	 * - `DOI:<doi>`* - a Digital Object Identifier, e.g. DOI:10.18653/v1/N18-3011
	 * - `ARXIV:<id>`* - arXiv.rg, e.g. ARXIV:2106.15928
	 * - `MAG:<id>`* - Microsoft Academic Graph, e.g. MAG:112218234
	 * - `ACL:<id>` - Association for Computational Linguistics, e.g. ACL:W12-3903
	 * - `PMID:<id>`* - PubMed/Medline, e.g. PMID:19872477
	 * - `PMCID:<id>`* - PubMed Central, e.g. PMCID:2323736
	 * - `URL:<url>` - URL from one of the sites listed below, e.g. URL:https://arxiv.org/abs/2106.15928v1
	 *
	 * URLs are recognized from the following sites:
	 * - semanticscholar.org
	 * - arxiv.org
	 * - aclweb.org
	 * - acm.org
	 * - biorxiv.org
	 */
	async getIndexedWorks(
		identifiers: PID[],
	): Promise<IndexedWork<Reference>[]> {
		// Semantic-specific logic for fetching references
		const paperIdentifiers = identifiers.map(Semantic.mapLookupIDToString);
		const url = `https://api.semanticscholar.org/graph/v1/paper/batch?fields=references,externalIds,title,references.externalIds,references.title`;
		const response = await this.makeRequest(
			"POST",
			url,
			JSON.stringify({ ids: paperIdentifiers }),
		);
		const semanticPaper = Array.isArray(response?.response)
			? (response.response as (SemanticPaper | null)[])
			: [];
		return semanticPaper
			.filter((paper): paper is SemanticPaper => paper !== null)
			.map((paper) => {
				return {
					references: paper.references.map(
						Semantic.mapReferenceToParsableItem,
					),
					identifiers: Semantic.mapIdentifiers(paper.externalIds),
					primaryID: paper.paperId,
				};
			});
	}

	private async makeRequest(
		method: string,
		url: string,
		body?: string,
		jobID?: string,
	): Promise<XMLHttpRequest> {
		const apiKey = getPref("semantickey"); //prefs.getSemanticAPIKey();
		const options = {
			headers: {
				"User-Agent": `${Wikicite.getUserAgent()} mailto:cita@duck.com`,
				"X-API-Key": apiKey,
			},
			responseType: "json",
			body: body,
		};
		return await this.limiter.schedule({ id: jobID }, () =>
			Zotero.HTTP.request(method, url, options).catch((e) => {
				// Note: a 400 (Bad Request) response is returned if none of the IDs are found
				switch (e.status) {
					case 403:
						throw new Error(
							`Received a 403 Forbidden response from Semantic Scholar. Check that your API key is valid.`,
						);
					case 429:
						Zotero.logError(e);
						// throw new Error(
						// 	`Received a 429 rate limit response from Semantic Scholar. Try getting references for fewer items at a time, or use an API key.`,
						// );
						throw e;
					default:
						throw e;
				}
			}),
		);
	}

	private static mapReferenceToParsableItem(
		reference: Reference,
	): ParsableReference<Reference> {
		return {
			primaryID: reference.paperId || reference.title, // If there's no paper ID, it's basically a piece of the PDF that Semantic Scholar couldn't match to a reference
			externalIds: Semantic.mapIdentifiers(reference.externalIds),
			rawObject: reference,
		};
	}

	private static mapIdentifiers(externalIds: ExternalIDS | null): PID[] {
		if (!externalIds) return [];
		const pids: PID[] = [];
		if (externalIds.DOI) pids.push(new PID("DOI", externalIds.DOI));
		if (externalIds.ArXiv) pids.push(new PID("arXiv", externalIds.ArXiv));
		if (externalIds.PubMed) pids.push(new PID("PMID", externalIds.PubMed));
		if (externalIds.PubMedCentral)
			pids.push(new PID("PMCID", externalIds.PubMedCentral));
		if (externalIds.MAG) pids.push(new PID("MAG", externalIds.MAG));
		if (externalIds.CorpusId)
			pids.push(new PID("CorpusID", `${externalIds.CorpusId}`));
		return pids;
	}

	private static mapLookupIDToString(pid: PID): string {
		switch (pid.type) {
			case "DOI":
				if (pid.id.includes("arXiv.")) {
					// Semantic Scholar doesn't like arXiv DOIs, so we extract the arXiv ID
					const arXivID = pid.id.split("arXiv.")[1];
					return `ARXIV:${arXivID}`;
				} else {
					return `DOI:${pid.id}`;
				}
			case "arXiv":
				return `ARXIV:${pid.id}`;
			case "MAG":
				return `MAG:${pid.id}`;
			case "CorpusID":
				return `CorpusId:${pid.id}`;
			case "PMID":
				return `PMID:${pid.id}`;
			case "PMCID":
				return `PMCID:${pid.id}`;
			case "OpenAlex":
				// As per the docs (https://docs.openalex.org/how-to-use-the-api/get-single-entities#the-openalex-key), if a MAG key exists, it's just the OpenAlex key without the leading W.
				return `MAG:${pid.id.substring(1)}`;
			default:
				throw new Error("Unsupported UID type");
		}
	}
}
