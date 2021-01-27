import lookup from './lookup';

const suppliers = [
	// https://opencitations.net/oci
	{ prefix: '010', name: 'wikidata', id: 'qid' },
	{ prefix: '020', name: 'crossref', id: 'doi' },
	{ prefix: '030', name: 'occ', id: 'occ' },
	{ prefix: '040', name: 'dryad', id: 'doi' },
	{ prefix: '050', name: 'croci', id: 'doi' }
];

const codes = new Map(
	lookup.map(({c, code}) => [String(c), Number(code)])
);


/* global Zotero */

export default class {
	static getOci(supplierName, citingId, citedId) {
		const supplier = suppliers.filter((supplier) => supplier.name === supplierName)[0];
		if (!supplier) {
			throw new Error('Unsupported OCI supplier');
		}
		let prefix = supplier.prefix;
		if (supplier.id === 'doi') {
			citingId = Zotero.Utilities.cleanDOI(citingId) ?? '';
			citedId = Zotero.Utilities.cleanDOI(citedId) ?? '';
			// drop leading "10."
			citingId = citingId.substring(3);
			citedId = citedId.substring(3);
		} else {
			let pattern;
			if (supplier.id === 'qid') {
				pattern = /^Q([0-9]+)$/;
			} else if (supplier.id === 'occ') {
				pattern = /^([0-9])+$/;
			}
			citingId = citingId.match(pattern);
			citedId = citedId.match(pattern);
			citingId = citingId ? citingId[1] : '';
			citedId = citedId ? citedId[1] : '';
		}
		if (citingId && citedId) {
			if (supplier.id === 'doi') {
				// encode
				citingId = this.encodeId(citingId);
				citedId = this.encodeId(citedId);
			}
		} else {
			throw new Error('Unexpected citing or cited ID format');
		}
		return `${prefix}${citingId}-${prefix}${citedId}`;
	}

	static parseOci(oci, supplierName) {
		const match = oci.match(/^([0-9]{3})([0-9]+)-([0-9]{3})([0-9]+)$/)
		if (!match) {
			throw new Error('Wrong OCI format');
		}
		const [, citingPrefix, citing, citedPrefix, cited] = match;
		if (citingPrefix !== citedPrefix) {
			throw new Error('Citing and cited prefixes do not match');
		}
		const supplier = suppliers.filter((supplier) => supplier.prefix === citingPrefix)[0];
		if (!supplier) {
			throw new Error('No supplier found for prefix ' + citingPrefix);
		}
		if (supplierName && supplierName !== supplier.name) {
			throw new Error('Inferred and provided suppliers do not match');
		}
		let citingId;
		let citedId;
		switch (supplier.id) {
			case 'doi':
				citingId = '10.' + this.decodeId(citing);
				citedId = '10.' + this.decodeId(cited);
				break;
			case 'qid':
				citingId = 'Q' + citing;
				citedId = 'Q' + cited;
				break;
		}
		return {
			citingId,
			citedId,
			idType: supplier.id,
			supplier: supplier.name
		};
	}

	static decodeId(encodedId) {
		const map = new Map(
			Array.from(codes, (code) => code.reverse())
		);
		let id = ''
		let code = ''
		for (const char of encodedId) {
			code += char;
			if (code.length < 2) {
				// min code length is 2
				continue;
			}
			const value = map.get(Number(code));
			if (value !== undefined) {
				id += value;
				code = '';
			}
		}
		if (code) {
			throw new Error('Could not find character for code ' + code);
		}
		return id;
	}

	static encodeId(id) {
		let encodedId = '';
		for (const char of id) {
			const code = codes.get(char);
			if (code === undefined) {
				throw new Error('Could not find code for character ' + char);
			} else {
				encodedId += String(code).padStart(2, '0');
			}
		}
		return encodedId;
	}

	static goTo(oci) {
		// link to the generator (instead of the resolved URL), so the resolutor can generate the entry (?)
	    // next to each citation, I may provide these links as icons
	    // icons are clickable (grey if provider is unavailable yet) to export as CROCI, or sync to wikidata for individual citations
	    // if click when grey, offer to upload
	    // if clieck when colored, go to the OCI resolver
	    // they are grey but not clickable if either soource or target dont' have DOI or QID; respectively
	    // makes no sense to export to CROCI if already in COCI, I think
	    // for OCC no link is provided
		Services.prompt.alert(
			window,
			'Opening in OpenCitations not yet supported',
			'Going to OCI not yet supported'
		);
	}

	// constructor({supplier, oci, citingId, citedId } = {}) {
	// 	if (oci) {
	// 		[supplier, citingId, citedId] = this.parseOci(oci, supplier);
	// 	} else if (supplier && citingId && citedId) {
	// 		if (!suppliers.filter((supplier) => supplier.name === supplier)) {
	// 			throw new Error('Unsupported OCI supplier' + supplier);
	// 		}
	// 		oci = this.getOci(supplier, citingId, citedId);
	// 	} else {
	// 		throw new Error('Either provide OCI, or supplier and citing and cited IDs');
	// 	}
	// 	this.oci = oci;
	// 	this.citingId = citingId;
	// 	this.citedId = citedId;
	// 	this.supplier = supplier;
	// 	return this;
	// }
}
