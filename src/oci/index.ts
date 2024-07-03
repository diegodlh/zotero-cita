import lookup from "./lookup";

const suppliers: { prefix: string; name: string; id: "qid" | "doi" | "occ" }[] =
	[
		// https://opencitations.net/oci
		{ prefix: "010", name: "wikidata", id: "qid" },
		{ prefix: "020", name: "crossref", id: "doi" },
		{ prefix: "030", name: "occ", id: "occ" },
		{ prefix: "040", name: "dryad", id: "doi" },
		{ prefix: "050", name: "croci", id: "doi" },
	];

const codes = new Map(lookup.map(({ c, code }) => [String(c), Number(code)]));

export default class {
	static getOci(supplierName: string, citingId: string, citedId: string) {
		const supplier = suppliers.filter(
			(supplier) => supplier.name === supplierName,
		)[0];
		if (!supplier) {
			throw new Error("Unsupported OCI supplier");
		}
		const prefix = supplier.prefix;
		if (supplier.id === "doi") {
			citingId = Zotero.Utilities.cleanDOI(citingId) ?? "";
			citedId = Zotero.Utilities.cleanDOI(citedId) ?? "";
			// drop leading "10."
			citingId = citingId.substring(3);
			citedId = citedId.substring(3);
		} else {
			let pattern: RegExp;
			switch (supplier.id) {
				case "qid":
					pattern = /^Q([0-9]+)$/;
					break;
				case "occ":
					pattern = /^([0-9])+$/;
					break;
			}
			const citingIdMatch = citingId.match(pattern);
			const citedIdMatch = citedId.match(pattern);
			citingId = citingIdMatch ? citingIdMatch[1] : "";
			citedId = citedIdMatch ? citedIdMatch[1] : "";
		}
		if (citingId && citedId) {
			if (supplier.id === "doi") {
				// encode
				citingId = this.encodeId(citingId);
				citedId = this.encodeId(citedId);
			}
		} else {
			throw new Error("Unexpected citing or cited ID format");
		}
		return `${prefix}${citingId}-${prefix}${citedId}`;
	}

	static parseOci(oci: string, supplierName?: string) {
		const match = oci.match(/^([0-9]{3})([0-9]+)-([0-9]{3})([0-9]+)$/);
		if (!match) {
			throw new Error("Wrong OCI format");
		}
		const [, citingPrefix, citing, citedPrefix, cited] = match;
		if (citingPrefix !== citedPrefix) {
			throw new Error("Citing and cited prefixes do not match");
		}
		const supplier = suppliers.filter(
			(supplier) => supplier.prefix === citingPrefix,
		)[0];
		if (!supplier) {
			throw new Error("No supplier found for prefix " + citingPrefix);
		}
		if (supplierName && supplierName !== supplier.name) {
			throw new Error("Inferred and provided suppliers do not match");
		}
		let citingId;
		let citedId;
		switch (supplier.id) {
			case "doi":
				citingId = "10." + this.decodeId(citing);
				citedId = "10." + this.decodeId(cited);
				break;
			case "qid":
				citingId = "Q" + citing;
				citedId = "Q" + cited;
				break;
		}
		return {
			citingId,
			citedId,
			idType: supplier.id,
			supplier: supplier.name,
		};
	}

	static decodeId(encodedId: string) {
		const map = new Map(
			Array.from(codes, (codeString, codeNumber) => [
				codeNumber,
				codeString,
			]),
		);
		let id = "";
		let code = "";
		for (const char of encodedId) {
			code += char;
			if (code.length < 2) {
				// min code length is 2
				continue;
			}
			const value = map.get(Number(code));
			if (value !== undefined) {
				id += value;
				code = "";
			}
		}
		if (code) {
			throw new Error("Could not find character for code " + code);
		}
		return id;
	}

	static encodeId(id: string) {
		let encodedId = "";
		for (const char of id) {
			const code = codes.get(char);
			if (code === undefined) {
				throw new Error("Could not find code for character " + char);
			} else {
				encodedId += String(code).padStart(2, "0");
			}
		}
		return encodedId;
	}

	/**
	 * Resolve OCI with OCI Resolution Service
	 * @param {String} oci - OCI to resolve
	 */
	static resolve(oci: string) {
		if (this.parseOci(oci)) {
			Zotero.launchURL("https://opencitations.net/oci?oci=" + oci);
		}
	}
}
