import PID from "../cita/PID";
import lookup from "./lookup";

type Extends<T, U extends T> = U;
export type OCIPIDType = Extends<PIDType, "DOI" | "QID" | "OMID">;

const suppliers: {
	prefix: string;
	name: string;
	id: OCIPIDType;
}[] = [
	// https://opencitations.net/oci
	{ prefix: "01", name: "wikidata", id: "QID" },
	{ prefix: "02", name: "crossref", id: "DOI" },
	{ prefix: "03", name: "occ", id: "OMID" }, // Defunct
	{ prefix: "04", name: "dryad", id: "DOI" },
	{ prefix: "05", name: "croci", id: "DOI" }, // Defunct
	{ prefix: "06", name: "oci", id: "OMID" },
];

const codes = new Map(lookup.map(({ c, code }) => [String(c), Number(code)]));

export default class OCI {
	static getOci(
		supplierName: string,
		citingId: PID | string,
		citedId: PID | string,
	): string {
		if (typeof citingId === "string" && typeof citedId === "string") {
			return this._getOci(supplierName, citingId, citedId);
		} else if (
			!(
				citingId instanceof PID &&
				citedId instanceof PID &&
				citingId.type === citedId.type
			)
		) {
			throw new Error("Citing and cited IDs must be of the same type");
		}

		return this._getOci(supplierName, citingId.id, citedId.id);
	}

	private static _getOci(
		supplierName: string,
		citingId: string,
		citedId: string,
	): string {
		const supplier = suppliers.filter(
			(supplier) => supplier.name === supplierName,
		)[0];
		if (!supplier) {
			throw new Error("Unsupported OCI supplier");
		}
		const prefix = supplier.prefix;
		if (supplier.id === "DOI") {
			citingId = Zotero.Utilities.cleanDOI(citingId) ?? "";
			citedId = Zotero.Utilities.cleanDOI(citedId) ?? "";
			// drop leading "10."
			citingId = citingId.substring(3);
			citedId = citedId.substring(3);
		} else {
			let pattern: RegExp;
			switch (supplier.id) {
				case "QID":
					pattern = /^Q([0-9]+)$/;
					break;
				case "OMID":
					pattern = /^([0-9])+$/;
					break;
			}
			const citingIdMatch = citingId.match(pattern);
			const citedIdMatch = citedId.match(pattern);
			citingId = citingIdMatch ? citingIdMatch[1] : "";
			citedId = citedIdMatch ? citedIdMatch[1] : "";
		}
		if (citingId && citedId) {
			if (supplier.id === "DOI") {
				// encode
				citingId = this.encodeId(citingId);
				citedId = this.encodeId(citedId);
			} else if (supplier.id === "OMID") {
				// the prefix is part of the ID: /06[1-9]*0/
				return `${citingId}-${citedId}`;
			}
		} else {
			throw new Error("Unexpected citing or cited ID format");
		}
		return `${prefix}0${citingId}-${prefix}0${citedId}`;
	}

	static parseOci(oci: string, supplierName?: string) {
		const match = oci.match(/^(0[1-9]+0)([0-9]+)-(0[1-9]+0)([0-9]+)$/);
		if (!match) {
			throw new Error("Wrong OCI format");
		}
		const [, citingPrefix, citing, citedPrefix, cited] = match;
		if (citingPrefix.substring(0, 2) !== citedPrefix.substring(0, 2)) {
			throw new Error(
				"Citing and cited prefixes are from different suppliers",
			);
		}
		const supplier = suppliers.filter(
			(supplier) => supplier.prefix === citingPrefix.substring(0, 2),
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
			case "DOI":
				citingId = "10." + this.decodeId(citing);
				citedId = "10." + this.decodeId(cited);
				break;
			case "QID":
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
