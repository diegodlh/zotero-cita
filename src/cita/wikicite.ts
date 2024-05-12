import Wikidata from "./wikidata";

// declare const Components: any;
// declare const Services: any;
// declare const Zotero: any;
// declare global {
//     interface Window { openDialog: (url: string, name: string, features: string, args:Object, retVals?: Object) => any; }
// }

Components.utils.import("resource://gre/modules/Services.jsm");

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

	_bundle: (() => {
		const zoteroLocale = Zotero.locale;
		const requestedLocale = Services.locale.getRequestedLocale();
		let propertiesFile;
		if (zoteroLocale.split("-")[0] === requestedLocale.split("-")[0]) {
			propertiesFile = "chrome://cita/locale/wikicite.properties";
		} else {
			// support locales not supported by Zotero
			propertiesFile = [
				"chrome://cita/content/locale",
				requestedLocale,
				"wikicite.properties",
			].join("/");
		}
		return Services.strings.createBundle(propertiesFile);
	})(),
	_fallbackBundle: Services.strings.createBundle(
		"chrome://cita/content/locale/en-US/wikicite.properties",
	),

	cleanPID: function (type: string, value: string) {
		type = type.toUpperCase();
		value = value || "";
		switch (type) {
			case "DOI":
				return Zotero.Utilities.cleanDOI(value);
			case "ISBN":
				return Zotero.Utilities.cleanISBN(value);
			case "QID":
				return Wikidata.cleanQID(value);
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
				let match = line.match(pattern);
				if (!match) {
					return true;
				}
				let [, value] = match;
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
		if (!Array.isArray(values)) {
			values = [values];
		}
		let { newExtra } = this.getExtraField(item, fieldName);
		for (let value of values) {
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
				window,
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
		const nameParts = name.split(".");
		// if leading part of the name is not 'wikicite', add it
		if (nameParts[0] !== "wikicite") nameParts.unshift("wikicite");
		name = nameParts.join(".");
		try {
			return this._bundle.GetStringFromName(name);
		} catch {
			try {
				return this._fallbackBundle.GetStringFromName(name);
			} catch {
				throw Error("Failed getting string from name " + name);
			}
		}
	},

	formatString: function (name: string, params: any | any[]) {
		if (!Array.isArray(params)) params = [params];
		// convert camelCase to hyphen-divided for translatewiki.net
		name = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
		const nameParts = name.split(".");
		// if leading part of the name is not 'wikicite', add it
		if (nameParts[0] !== "wikicite") nameParts.unshift("wikicite");
		name = nameParts.join(".");
		try {
			return this._bundle.formatStringFromName(
				name,
				params,
				params.length,
			);
		} catch {
			try {
				return this._fallbackBundle.formatStringFromName(
					name,
					params,
					params.length,
				);
			} catch {
				throw Error("Failed formatting string from name " + name);
			}
		}
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
