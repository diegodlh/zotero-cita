/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import Wikidata from "./wikidata";

import { getString as _getString } from "../utils/locale";

// declare const Components: any;
// declare const Services: any;
// declare const Zotero: any;
// declare global {
//     interface Window { openDialog: (url: string, name: string, features: string, args:Object, retVals?: Object) => any; }
// }

// Components.utils.import("resource://gre/modules/Services.jsm");

// Provides an alternative CSL Engine to obtain labels for the citation items
// However, it is very slow so an alternative approach will be used instead
// class CiteProc {
// 	sys: {
// 		items: any[];
// 		retrieveItem: (index: any) => any;
// 		retrieveLocale: (lang: any) => any;
// 	};
// 	cslEngine: any;
// 	constructor() {
// 		// Based on Zotero.Style.prototype.getCiteProc()
// 		this.sys = {
// 			items: [],
// 			retrieveItem: function (index) {
// 				const zoteroItem = this.items[index];
// 				if (!zoteroItem) {
// 					throw new Error();
// 				}
// 				if (!zoteroItem.libaryID) {
// 					// Fixme: this is just a workaround
// 					zoteroItem.libraryID = 1;
// 				}
// 				const cslItem = Zotero.Utilities.itemToCSLJSON(zoteroItem);
// 				cslItem.id = index;
// 				return cslItem;
// 			},
// 			retrieveLocale: function (lang) {
// 				return Zotero.Cite.Locale.get(lang);
// 			},
// 		};
// 		this.cslEngine = new Zotero.CiteProc.CSL.Engine(
// 			this.sys,
// 			Zotero.File.getContentsFromURL("chrome://cita/content/apa.csl"),
// 			Zotero.locale,
// 			false,
// 		);
// 	}
// }

/**
 * Wikicite namespace.
 */
export default {
	// /********************************************/
	// // Basic information
	// /********************************************/
	id: "zotero-wikicite@wikidata.org",
	version: undefined,
	// zoteroID: 'zotero@chnm.gmu.edu',
	// zoteroTabURL: 'chrome://zotero/content/tab.xul',

	cleanPID: function (type: PIDType, value: string) {
		switch (type) {
			case "DOI":
				return Zotero.Utilities.cleanDOI(value);
			case "ISBN":
				return Zotero.Utilities.cleanISBN(value);
			case "QID":
				return Wikidata.cleanQID(value);
			case "OMID":
				return Wikidata.cleanOMID(value);
			case "arXiv":
				return Wikidata.cleanArXiv(value);
			case "OpenAlex":
				return Wikidata.cleanOpenAlex(value);
			default:
				return value;
		}
	},

	getUserAgent: function () {
		return `Cita/v${this.version || "?"} (https://github.com/diegodlh/zotero-cita)`;
	},

	// citeproc: new CiteProc('http://www.zotero.org/styles/apa'),

	/********************************************/
	// General use utility functions
	/********************************************/

	// Fixme: check how to write correct JSDoc
	/**
	 * Return values for extra field fields.
	 * @param {Zotero.Item} item - A Zotero item.
	 * @param {string} fieldName - The extra field field name desired.
	 * @returns {extra} extra - Extra field after desired extra field fields have been extracted.
	 * @returns {values} values - Array of values for the desired extra field field.
	 */
	getExtraField: function (item: any, fieldName: string) {
		const pattern = new RegExp(`^${fieldName}:(.+)$`, "i");
		const extra = item.getField("extra") as string;
		const lines = extra.split(/\n/g);
		const values: string[] = [];
		const newExtra = lines
			.filter((line) => {
				const match = line.match(pattern);
				if (!match) {
					return true;
				}
				const [, value] = match;
				values.push(value.trim());
				return false;
			})
			.join("\n");
		return {
			newExtra,
			values,
		};
	},

	/**
	 * Set field value in extra field item.
	 * It sets: therefore, if already exists, replaces
	 * @param {Zotero.Item} item - A Zotero item.
	 * @param {string} fieldName - The name of the extra field that wants to be set.
	 * @param {String[]} values - An array of values for the field that wants to be set.
	 */
	setExtraField: function (item: any, fieldName: string, values: string[]) {
		let { newExtra } = this.getExtraField(item, fieldName);
		for (const value of values) {
			if (value) {
				// I have to be very careful that there are no new lines in what I'm saving
				newExtra += `\n${fieldName}: ${value.trim()}`;
			}
		}
		item.setField("extra", newExtra);
	},

	/*
	 * Return Citations note
	 */
	getCitationsNote: function (item: Zotero.Item) {
		// Fixme: consider moving to SourceItemWrapper
		const notes = Zotero.Items.get(item.getNotes()).filter(
			(note: any) => note.getNoteTitle() === "Citations",
		);
		if (notes.length > 1) {
			Services.prompt.alert(
				window as mozIDOMWindowProxy,
				this.getString("wikicite.global.name"),
				this.getString(
					"wikicite.source-item.get-citations-note.error.multiple",
				),
			);
		}
		return notes[0];
	},

	getString: function (name: string) {
		// convert camelCase to hyphen-divided for translatewiki.net
		name = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
		name = name.replace(/\./g, "_"); // convert . to - for fluent
		const nameParts = name.split("_");
		// if leading part of the name is not 'wikicite', add it
		if (nameParts[0] !== "wikicite") nameParts.unshift("wikicite");
		name = nameParts.join("_");
		return _getString(name);
		// try {
		// 	return this._bundle.GetStringFromName(name);
		// } catch {
		// 	try {
		// 		return this._fallbackBundle.GetStringFromName(name);
		// 	} catch {
		// 		throw Error("Failed getting string from name " + name);
		// 	}
		// }
	},

	formatString: function (name: string, params: unknown | unknown[]) {
		// convert camelCase to hyphen-divided for translatewiki.net
		name = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
		name = name.replace(/\./g, "_"); // convert . to - for fluent
		const nameParts = name.split("_");
		// if leading part of the name is not 'wikicite', add it
		if (nameParts[0] !== "wikicite") nameParts.unshift("wikicite");
		name = nameParts.join("_");
		if (!Array.isArray(params)) params = [params];
		// pass ordered parameters as "s1", "s2", ..., "sn"
		const args = Object.fromEntries(
			(params as unknown[]).map((param, index) => [
				`s${index + 1}`,
				param,
			]),
		);
		return _getString(name, { args });
		// try {
		// 	return this._bundle.formatStringFromName(
		// 		name,
		// 		params,
		// 		params.length,
		// 	);
		// } catch {
		// 	try {
		// 		return this._fallbackBundle.formatStringFromName(
		// 			name,
		// 			params,
		// 			params.length,
		// 		);
		// 	} catch {
		// 		throw Error("Failed formatting string from name " + name);
		// 	}
		// }
	},

	selectItem: function () {
		// Adapted from Zotero's bindings/relatedbox.xml
		const io = { singleSelection: true, dataOut: [] };
		window.openDialog(
			"chrome://zotero/content/selectItemsDialog.xul",
			"",
			"chrome,dialog=no,modal,centerscreen,resizable=yes",
			io,
		);
		if (!io.dataOut || !io.dataOut.length) {
			return;
		}
		const id = io.dataOut[0];
		const item = Zotero.Items.get(id);

		return item;
	},

	// // Return citation and bibliography labels for list of items provided
	// getItemLabels: function(items) {
	//     // This method is nice, but slow
	//     this.citeproc.sys.items = items;
	//     const indices = [...Array(items.length).keys()]
	//     // defined citable items
	//     const t0 = performance.now();
	//     this.citeproc.cslEngine.updateItems(indices);
	//     const t1 = performance.now();
	//     console.log(`Updating items in the CSL engine took  ${t1-t0}ms.`)
	//     const citation = {
	//         citationItems: indices.map((index) => ({id: index})),
	//         properties: {}
	//     };
	//     // find better citeproc function!
	//     const t2 = performance.now();
	//     const shortLabels = this.citeproc.cslEngine.previewCitationCluster(citation, [], [], 'text').split(';');
	//     const t3 = performance.now();
	//     console.log(`Getting short labels from the CSL engine took  ${t3-t2}ms.`)
	//     const longLabels = items.map(() => 'Long label will be shown here');
	//     return { short: shortLabels, long: longLabels };
	// }
};

export function debug(msg: string, err?: Error) {
	if (err) {
		Zotero.debug(
			`{Cita} ${new Date()} error: ${msg} (${err} ${err.stack})`,
		);
	} else {
		Zotero.debug(`{Cita} ${new Date()}: ${msg}`);
	}
	// console.log(msg);
}
