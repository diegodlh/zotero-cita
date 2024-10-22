export default class PID {
	type: PIDType;
	id: string;

	constructor(type: PIDType, id: string) {
		this.type = type;
		this.id = id;
	}

	get url(): string | null {
		const cleanPID = this.cleanID;
		if (cleanPID) {
			switch (this.type) {
				case "DOI": {
					const url =
						"https://doi.org/" +
						// From Zotero's itembox.xml:
						// Encode some characters that are technically valid in DOIs,
						// though generally not used. '/' doesn't need to be encoded.
						cleanPID
							.replace(/#/g, "%23")
							.replace(/\?/g, "%3f")
							.replace(/%/g, "%25")
							.replace(/"/g, "%22");
					return url;
				}
				case "OMID":
					return "https://opencitations.net/meta/" + cleanPID;
				case "OpenAlex":
					return "https://openalex.org/works/" + cleanPID;
				case "arXiv":
					return "https://arxiv.org/abs/" + cleanPID;
				case "QID":
					return "https://www.wikidata.org/wiki/" + cleanPID;
				case "CorpusID":
					return (
						"https://api.semanticscholar.org/CorpusID:" + cleanPID
					);
			}
		}
		return null;
	}

	/** Get the cleaned ID or null */
	get cleanID(): string | null {
		switch (this.type) {
			case "DOI":
				return Zotero.Utilities.cleanDOI(this.id);
			case "ISBN":
				return Zotero.Utilities.cleanISBN(this.id) || null;
			case "QID": {
				let qid = this.id.toUpperCase().trim();
				if (qid[0] !== "Q") qid = "Q" + qid;
				if (!qid.match(/^Q\d+$/)) qid = "";
				return qid;
			}
			case "OMID": {
				let omid = this.id.toLowerCase().trim();
				if (/^https?:/.test(omid))
					omid = omid.match(/br\/\d+/)?.[0] ?? "";
				if (omid.substring(0, 3) !== "br/") omid = "br/" + omid;
				if (!omid.match(/^br\/\d+$/)) omid = "";
				return omid;
			}
			case "arXiv": {
				const arXiv_RE =
					/\b(([-A-Za-z.]+\/\d{7}|\d{4}\.\d{4,5})(?:v(\d+))?)(?!\d)/g; // 1: full ID, 2: ID without version, 3: version #
				const m = arXiv_RE.exec(this.id);
				if (m) {
					const cleanArXiv = m[2];
					return cleanArXiv;
				}

				return "";
			}
			case "OpenAlex": {
				let openAlex = this.id.trim();
				if (/^https?:/.test(openAlex))
					openAlex = openAlex.match(/[Ww]\d+/)?.[0] ?? "";
				openAlex = openAlex.toUpperCase();
				if (openAlex[0] !== "W") openAlex = "W" + openAlex;
				if (!openAlex.match(/^W\d+$/)) openAlex = "";
				return openAlex;
			}
			default:
				return this.id;
		}
	}

	/**
	 * Clean the ID if possible
	 * @returns The cleaned ID or null if it couldn't be cleaned
	 */
	cleaned(): this | null {
		if (this.cleanID) {
			this.id = this.cleanID;
			return this;
		} else {
			return null;
		}
	}

	get zoteroIdentifier():
		| { DOI: string }
		| { ISBN: string }
		| { arXiv: string }
		| { adsBibcode: string }
		| { PMID: string }
		| null {
		return Zotero.Utilities.extractIdentifiers(this.id)[0] ?? null;
	}

	static readonly allTypes: PIDType[] = [
		"DOI",
		"ISBN",
		"QID",
		"OMID",
		"arXiv",
		"OpenAlex",
		"MAG",
		"CorpusID",
		"PMID",
		"PMCID",
	];

	static readonly showable: PIDType[] = [
		"DOI",
		"ISBN",
		"QID",
		"OMID",
		"arXiv",
		"OpenAlex",
		"CorpusID",
		// Don't show PMID or PMCID because we can't fetch citations from them
	];

	static readonly fetchable: PIDType[] = [
		"QID",
		"OMID",
		"OpenAlex",
		"DOI",
		"CorpusID",
	];
}
