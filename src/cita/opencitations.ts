import { IndexedWork, IndexerBase, ParsableReference } from "./indexer";
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

	/**
	 * Get references from OpenCitations for items with identifiers.
	 * @param {PID[]} identifiers - Array of DOIs or other identifiers for which to get references.
	 * @returns {Promise<IndexedWork<string>[]>} list of references, or [] if none.
	 */
	async getIndexedWorks(
		identifiers: PID[],
	): Promise<IndexedWork<OCCitation>[]> {
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

			const response = await this.limiter
				.schedule(() => Zotero.HTTP.request("GET", url, options))
				.catch((e) => {
					debug(
						`Couldn't access URL: ${url}. Got status ${e.status}.`,
					);
				});
			const citedWorks = response?.response as OCCitation[];
			if (citedWorks && citedWorks.length) {
				// The omid (first half of oci) should be the same for all cited works
				const _omid = citedWorks[0].oci.split("-")[0];
				// Sanity check
				if (
					citedWorks
						.map((e) => e.oci.split("-")[0])
						.some((e) => e !== _omid)
				) {
					debug(`Multiple OMIDs referenced for ${pid.id}`);
				}
				return {
					references: citedWorks.map(OpenCitations.mapToParsableItem),
					identifiers: [pid],
					primaryID: _omid,
				};
			} else {
				return null;
			}
		});
		const results = (await Promise.all(requests)).filter((e) => e !== null);
		return results as IndexedWork<OCCitation>[];
	}

	private static mapToParsableItem(
		item: OCCitation,
	): ParsableReference<OCCitation> {
		return {
			primaryID: item.oci,
			externalIds: OpenCitations.parseCitationString(item.cited),
			rawObject: item,
			oci: item.oci,
		};
	}

	private static parseCitationString(cited: string): PID[] {
		// String is in the format "type:identifier type:identifier ..." where identifier may contain colons
		return cited
			.split(" ")
			.map((e) => {
				const [type, ...identifier] = e.split(":");
				return [type, identifier.join(":")];
			})
			.map(([type, identifier]) => {
				switch (type) {
					case "doi":
						return new PID("DOI", identifier);
					case "isbn":
						return new PID("ISBN", identifier);
					case "omid":
						return new PID("OMID", identifier);
					case "openalex":
						return new PID("OpenAlex", identifier);
					case "pmid":
						return new PID("PMID", identifier);
					default:
						return null;
				}
			})
			.filter((e) => e !== null) as PID[];
	}
}
