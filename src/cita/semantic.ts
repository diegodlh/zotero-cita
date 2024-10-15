import Wikicite, { debug } from "./wikicite";
import Lookup from "./zotLookup";
//import Bottleneck from "bottleneck";
import { IndexedWork, IndexerBase, LookupIdentifier } from "./indexer";
import ItemWrapper from "./itemWrapper";

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

	supportedPIDs: PIDType[] = [
		"DOI",
		"arXiv",
		"CorpusID",
		"OpenAlex",
		"PMID",
		"PMCID",
	];

	maxRPS: number = 1; // Request per second

	async fetchPIDs(item: ItemWrapper): Promise<LookupIdentifier[] | null> {
		let identifier: LookupIdentifier | null = null;
		for (const pid of this.supportedPIDs) {
			const value = item.getPID(pid, true); // Already clean them up
			if (value) identifier = { type: pid, id: value };
		}

		if (identifier) {
			const url = `https://api.semanticscholar.org/graph/v1/paper/${this.mapLookupIDToString(identifier)}?fields=externalIds`;
			const options = {
				headers: {
					// TODO: add auth depending on api key
					"User-Agent": `${Wikicite.getUserAgent()} mailto:cita@duck.com`,
				},
				responseType: "json",
			};
			const response = await Zotero.HTTP.request("GET", url, options);
			const externalIds = (response?.response as SemanticPaper)
				.externalIds;
			if (externalIds) {
				const pids: LookupIdentifier[] = [
					{ type: "CorpusID", id: `${externalIds.CorpusId}` },
				];
				if (externalIds.DOI)
					pids.push({ type: "DOI", id: externalIds.DOI });
				if (externalIds.ArXiv)
					pids.push({ type: "arXiv", id: externalIds.ArXiv });
				if (externalIds.PubMed)
					pids.push({ type: "PMID", id: externalIds.PubMed });
				if (externalIds.PubMedCentral)
					pids.push({ type: "PMCID", id: externalIds.PubMedCentral });
				if (externalIds.MAG)
					pids.push({ type: "OpenAlex", id: "W" + externalIds.MAG });
				return pids;
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
	 * - `MAG:<id>`* - Microsoft Academic Graph, e.g. MAG:112218234 (OpenAlex without W)
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
	async getReferences(
		identifiers: LookupIdentifier[],
	): Promise<IndexedWork<Reference>[]> {
		// Semantic-specific logic for fetching references
		const paperIdentifiers = identifiers.map(this.mapLookupIDToString);
		const url = `https://api.semanticscholar.org/graph/v1/paper/batch?fields=references,title,references.externalIds,references.title`;
		const options = {
			headers: {
				// TODO: add auth depending on api key
				"User-Agent": `${Wikicite.getUserAgent()} mailto:cita@duck.com`,
			},
			responseType: "json",
			body: JSON.stringify({ ids: paperIdentifiers }),
		};
		const response = await Zotero.HTTP.request("POST", url, options).catch(
			(e) => {
				debug(`Couldn't access URL: ${url}. Got status ${e.status}.`);
				if (e.status == 429) {
					throw new Error(
						`Received a 429 rate limit response from Semantic Scholar. Try getting references for fewer items at a time.`,
					);
				}
			},
		);
		const semanticPaper = (response?.response as SemanticPaper[]) || [];
		return semanticPaper.map((paper): IndexedWork<Reference> => {
			return {
				referenceCount: paper.references.length,
				referencedWorks: paper.references,
			};
		});
	}

	mapLookupIDToString(uid: LookupIdentifier): string {
		switch (uid.type) {
			case "DOI":
				if (uid.id.includes("arXiv.")) {
					// Semantic Scholar doesn't like arXiv DOIs, so we extract the arXiv ID
					const arXivID = uid.id.split("arXiv.")[1];
					return `ARXIV:${arXivID}`;
				} else {
					return `DOI:${uid.id}`;
				}
			case "arXiv":
				return `ARXIV:${uid.id}`;
			case "OpenAlex":
				return `MAG:${uid.id.substring(1)}`;
			case "CorpusID":
				return `CorpusId:${uid.id}`;
			case "PMID":
				return `PMID:${uid.id}`;
			case "PMCID":
				return `PMCID:${uid.id}`;
			default:
				throw new Error("Unsupported UID type");
		}
	}

	/**
	 * Parse a list of references in JSON Crossref format.
	 * @param {Reference[]} references - Array of Crossref references to parse to Zotero items.
	 * @returns {Promise<Zotero.Item[]>} Zotero items parsed from references (where parsing is possible).
	 */
	async parseReferences(references: Reference[]): Promise<Zotero.Item[]> {
		// Semantic-specific parsing logic
		if (!references.length) {
			debug(
				"Item found in Semantic Scholar but doesn't contain any references",
			);
			return [];
		}

		// Extract one identifier per reference (prioritising DOI) and filter out those without identifiers
		const _identifiers = references
			.map(
				(item) =>
					item.externalIds?.DOI ??
					item.externalIds?.ArXiv ??
					item.externalIds?.PubMed ??
					null,
			)
			.filter((e) => e !== null);
		// Remove duplicates and extract identifiers
		const identifiers = [...new Set(_identifiers)].flatMap((e) =>
			Zotero.Utilities.extractIdentifiers(e!),
		);
		/*const semanticReferencesWithoutIdentifier = semanticReferences.filter(
			(item) => !item.DOI && !item.ISBN,
		);*/ // TODO: consider supporting, but those are usually some PDF text

		const openAlexIdentifiers = references
			.filter(
				(item) =>
					!item.externalIds?.DOI &&
					!item.externalIds?.ArXiv &&
					!item.externalIds?.PubMed &&
					item.externalIds?.MAG,
			)
			.map((ref) => "W" + ref.externalIds!.MAG!);

		Zotero.log(`Pure OA ids ${openAlexIdentifiers}`);
		// Use Lookup to get items for all identifiers
		const result = await Lookup.lookupItemsByIdentifiers(identifiers);
		const parsedReferences = result ? result : [];

		const openAlexResult =
			await Lookup.lookupItemsOpenAlex(openAlexIdentifiers);
		if (openAlexResult) parsedReferences.push(...openAlexResult);

		return parsedReferences;
	}
}
