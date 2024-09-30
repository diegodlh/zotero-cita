import Wikicite, { debug } from "./wikicite";
import Lookup from "./zotLookup";
//import Bottleneck from "bottleneck";
import { IndexedWork, IndexerBase } from "./indexer";

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

export default class Semantic extends IndexerBase<Reference> {
	indexerName = "Semantic Scholar";

	/**
	 * Get a list of references from Semantic Scholar for multiple DOIs at once.
	 * Returned in JSON Crossref format.
	 * @param {string[]} identifiers - Identifier (DOI, etc.) for the item for which to get references.
	 * @returns {Promise<IndexedWork<Reference>[]>} list of references, or [] if none.
	 */
	async getReferences(
		identifiers: string[],
	): Promise<IndexedWork<Reference>[]> {
		// Semantic-specific logic for fetching references
		// TODO: include support for all ids that Semantic Scholar supports. Parameter should therefore be of Identifier type
		const paperIdentifiers = identifiers.map((id) => `DOI:${id}`);
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
