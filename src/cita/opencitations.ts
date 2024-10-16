import { IndexedWork, IndexerBase } from "./indexer";
import Lookup from "./zotLookup";
import Wikicite, { debug } from "./wikicite";
import ItemWrapper from "./itemWrapper";
import PID from "./PID";

interface OCWork {
	title: string;
	issue: string;
	author: string;
	publisher: string;
	editor: string;
	pub_date: string;
	id: string;
	type: string;
	page: string;
	venue: string;
	volume: string;
}

interface OCCitation {
	cited: string;
	journal_sc: string; // yes/no
	author_sc: string; // yes/no
	timespan: string;
	creation: string;
	oci: string;
	citing: string;
}

export default class OpenCitations extends IndexerBase<OCCitation> {
	indexerName = "Open Citations";

	/**
	 * Supported PIDs for OpenCitations
	 * For searching citations, a smaller set of identifiers is supported
	 */
	supportedPIDs: PIDType[] = ["DOI", "OMID", "PMID"];

	async fetchPIDs(item: ItemWrapper): Promise<PID[] | null> {
		// TODO: support getting for multiple items
		// Based on API documentation, should support (doi|issn|isbn|omid|openalex|pmid|pmcid)
		const metatdataPIDs: PIDType[] = [
			"OMID",
			"DOI",
			"ISBN",
			"PMID",
			"PMCID",
			"OpenAlex",
		];
		const identifier = item.getBestPID(metatdataPIDs);

		if (identifier) {
			const param = `${identifier.type.toLowerCase()}:${identifier.id}`;
			const url = `https://w3id.org/oc/meta/api/v1/metadata/${param}`;
			const options = {
				headers: {
					"User-Agent": `${Wikicite.getUserAgent()} mailto:cita@duck.com`,
				},
				responseType: "json",
			};
			const response = await Zotero.HTTP.request(
				"GET",
				url,
				options,
			).catch((e) => {
				debug(`Couldn't access URL: ${url}. Got status ${e.status}.`);
			});

			const foundWork = (response?.response as OCWork[])[0];
			if (foundWork) {
				return foundWork.id
					.split(" ")
					.map((id) => {
						const components = id.split(":");
						const type = metatdataPIDs.filter(
							(pid) => pid.toLowerCase() === components[0],
						)[0];
						const value = components[1];
						return type ? { type, id: value } : null;
					})
					.filter((e) => e !== null) as PID[];
			}
		}

		return null;
	}

	getReferences(identifiers: PID[]): Promise<IndexedWork<OCCitation>[]> {
		const requests = identifiers.map(async (pid) => {
			let param = "";
			switch (pid.type) {
				case "DOI":
					param = `doi:${pid.id}`;
					break;
				case "OMID":
					param = `omid:${pid.id}`;
					break;
				case "PMID":
					param = `pmid:${pid.id}`;
					break;
			}
			const url = `https://opencitations.net/index/api/v2/references/${param}`;
			const options = {
				headers: {
					"User-Agent": `${Wikicite.getUserAgent()} mailto:cita@duck.com`,
				},
				responseType: "json",
			};
			const response = await Zotero.HTTP.request(
				"GET",
				url,
				options,
			).catch((e) => {
				debug(`Couldn't access URL: ${url}. Got status ${e.status}.`);
			});

			const citedWorks = response?.response as OCCitation[];
			return {
				referenceCount: citedWorks.length,
				referencedWorks: citedWorks,
			};
		});
		return Promise.all(requests);
	}

	async parseReferences(references: OCCitation[]): Promise<Zotero.Item[]> {
		if (!references.length) {
			debug(
				"Item found on OpenCitations but doesn't contain any references",
			);
			return [];
		}

		// Extract one identifier per reference (prioritising DOI) and filter out those without identifiers
		const _identifiers = references.map((citation) => {
			// Should be one of (doi|issn|isbn|omid|openalex|pmid|pmcid)
			return citation.cited
				.split(" ")
				.map((e) => e.split(":", 2))
				.map((e) => {
					switch (e[0]) {
						case "doi":
							return new PID("DOI", e[1]);
						case "isbn":
							return new PID("ISBN", e[1]);
						//case "omid":
						//	return new PID("OMID", e[1]);
						case "openalex":
							return new PID("OpenAlex", e[1]);
						case "pmid":
							return new PID("PMID", e[1]);
						default:
							return null;
					}
				})
				.filter((e) => e !== null)
				.sort((a, b) => {
					// Select best DOI > PMID > ISBN > openAlex
					if (a!.type === "DOI") return -1;
					if (b!.type === "DOI") return 1;
					if (a!.type === "PMID") return -1;
					if (b!.type === "PMID") return 1;
					if (a!.type === "ISBN") return -1;
					if (b!.type === "ISBN") return 1;
					if (a!.type === "OpenAlex") return -1;
					if (b!.type === "OpenAlex") return 1;
					return 0;
				})[0]; // return the first one
		});
		// Extract identifiers
		const identifiers = _identifiers
			.filter((e) => e && e.type !== "OpenAlex")
			.map((e) => e!);
		const openAlexIdentifiers = _identifiers
			.filter((e) => e && e.type === "OpenAlex")
			.map((e) => e!.id);

		// Use Lookup to get items for all identifiers
		const result = await Lookup.lookupItemsByIdentifiers(identifiers);
		const parsedReferences = result ? result : [];

		const openAlexResult =
			await Lookup.lookupItemsOpenAlex(openAlexIdentifiers);
		if (openAlexResult) parsedReferences.push(...openAlexResult);

		return parsedReferences;
	}
}
