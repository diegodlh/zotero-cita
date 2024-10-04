import Wikicite, { debug } from "./wikicite";
import Lookup from "./zotLookup";
//import Bottleneck from "bottleneck";
import { IndexedWork, IndexerBase } from "./indexer";
import SourceItemWrapper from "./sourceItemWrapper";

interface SemanticPaper {
	paperId: string;
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

type SupportedUID =
	| { DOI: string }
	| { arXiv: string }
	| { openAlex: string }
	| { semantic: string }
	| { PMID: string }
	| { PMCID: string };

export default class Semantic extends IndexerBase<Reference, SupportedUID> {
	indexerName = "Semantic Scholar";

	/**
	 * Extract supported UID from the source item.
	 * @param item Source item to extract the UID from.
	 * @returns Supported UID or null if not found.
	 */
	extractSupportedUID(item: SourceItemWrapper): SupportedUID | null {
		// DOI
		if (item.doi) return { DOI: item.doi };

		// ArXiv
		const rawarXiv =
			item.item.getField("archiveID") || item.item.getExtraField("arXiv");
		const arXiv_RE =
			/((?:[^A-Za-z]|^)([-A-Za-z.]+\/\d{7})(?:(v[0-9]+)|)(?!\d))|((?:\D|^)(\d{4}\.\d{4,5})(?:(v[0-9]+)|)(?!\d))/g; // Taken from zotero/utilities
		const m = arXiv_RE.exec(rawarXiv);
		if (m) {
			const arXiv = m[2] || m[5];
			return { arXiv };
		}

		// Semantic Scholar
		const semantic = Wikicite.getExtraField(item.item, "Corpus ID")
			.values[0];
		if (semantic) return { semantic };

		// OpenAlex
		const openAlex = Wikicite.getExtraField(item.item, "OpenAlex")
			.values[0];
		if (openAlex) return { openAlex };

		// PMID
		const PMID = Wikicite.getExtraField(item.item, "PMID").values[0];
		if (PMID) return { PMID };

		// PMCID
		const PMCID = Wikicite.getExtraField(item.item, "PMCID").values[0];
		if (PMCID) return { PMCID };

		return null;
	}

	/**
	 * Get a list of references from Semantic Scholar for multiple DOIs at once.
	 * Returned in JSON Crossref format.
	 * @param {SupportedUID[]} identifiers - Identifier (DOI, etc.) for the item for which to get references.
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
		identifiers: SupportedUID[],
	): Promise<IndexedWork<Reference>[]> {
		// Semantic-specific logic for fetching references
		const paperIdentifiers = identifiers.map(this.mapSupportedUIDToString);
		//identifier = Zotero.Utilities.cleanDOI(identifier);
		const url = `https://api.semanticscholar.org/graph/v1/paper/batch?fields=references,title,references.externalIds,references.title`;
		const options = {
			headers: {
				// TODO: add auth depending on api key
				"User-Agent": `${Wikicite.getUserAgent()} mailto:cita@duck.com`,
			},
			responseType: "json",
			body: JSON.stringify({ ids: paperIdentifiers }),
		};
		const response = await Zotero.HTTP.request("POST", url, options);
		const semanticPaper = (response?.response as SemanticPaper[]) || [];
		return semanticPaper.map((paper): IndexedWork<Reference> => {
			return {
				referenceCount: paper.references.length,
				referencedWorks: paper.references,
			};
		});
	}

	mapSupportedUIDToString(uid: SupportedUID): string {
		switch (true) {
			case "DOI" in uid:
				return `DOI:${uid.DOI}`;
			case "arXiv" in uid:
				return `ARXIV:${uid.arXiv}`;
			case "openAlex" in uid:
				return `MAG:${uid.openAlex.substring(1)}`;
			case "semantic" in uid:
				return `CorpusId:${uid.semantic}`;
			case "PMID" in uid:
				return `PMID:${uid.PMID}`;
			case "PMCID" in uid:
				return `PMCID:${uid.PMCID}`;
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
