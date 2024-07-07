import ItemWrapper from "./itemWrapper";
import Matcher from "./matcher";
import Progress from "./progress";
import SourceItemWrapper from "./sourceItemWrapper";
import Wikicite from "./wikicite";
import * as prefs from "../cita/preferences";

declare const Zotero: any;
declare const ZoteroPane: any;

export default class LCN {
	items: any[];
	itemMap: Map<any, any>;
	inputKeys: string[];
	libraryID: number;
	progress: Progress;

	constructor(items) {
		if (!items.length) return;
		this.items = items;
		this.itemMap = new Map(); // itemKey/tmpItemKey -> ItemWrapper

		// keys of the Zotero items treated as LCN "input items"
		this.inputKeys = items.map((item) => item.key);
		this.libraryID = items[0].libraryID; // all items will belong to same library

		this.progress = new Progress();
	}

	async init() {
		const tmpKeyMap = new Map(); // uid/title -> tmpKey

		this.progress.newLine(
			"loading",
			Wikicite.getString("wikicite.lcn.init.progress.getting-citations"),
		);

		// A short delay is needed before wrapping items
		// for the progress window to show
		await Zotero.Promise.delay(100);

		// Wrapping items (with citations) takes the most.
		// Using Promise.all hoping that it would wrap them in parallel
		// But there seems to be no difference.
		const wrappedItems: SourceItemWrapper[] = (await Promise.all(
			this.items.map(
				(item) =>
					new Promise((resolve) =>
						resolve(
							new SourceItemWrapper(item, prefs.getStorage()),
						),
					),
			),
		)) as SourceItemWrapper[];
		// const wrappedItems = this.items.map((item) => new SourceItemWrapper(item, window.Wikicite.Prefs.get('storage')));
		this.progress.updateLine("done");

		this.progress.newLine(
			"loading",
			Wikicite.getString("wikicite.lcn.init.progress.updating-links"),
		);
		const matcher = new Matcher(this.libraryID);
		await matcher.init();
		for (const wrappedItem of wrappedItems) {
			wrappedItem.autoLinkCitations(matcher, true);
		}
		this.progress.updateLine("done");

		this.progress.newLine(
			"loading",
			Wikicite.getString(
				"wikicite.lcn.init.progress.processing-citations",
			),
		);
		// Processing wrapped items takes way less time
		for (const wrappedItem of wrappedItems) {
			// try and link citations; if success, save
			// do we want to limit the search to the set of items selected?
			// wrappedItem.linkCitations()
			for (let i = 0; i < wrappedItem.citations.length; i++) {
				const citation = wrappedItem.citations[i];
				if (citation.target.key) {
					// if citation's target item is linked to a Zotero item...
					if (!this.inputKeys.includes(citation.target.key)) {
						// ... and the linked-to Zotero item has not been
						// selected (i.e., it is not an input item),
						// add the linked-to item to the item map.

						const linkedToItem = Zotero.Items.getByLibraryAndKey(
							this.libraryID,
							citation.target.key,
						);
						// Non-linked citation target items are not part of the
						// LCN "input items" set.
						// Citations of these non-linked citation target items
						// are unknown.
						// This citation's target item is linked to a Zotero item
						// which is not part of the LCN "input items" set either.
						// For consistency, citations of this Zotero item should be
						// unknown as well.
						// Therefore, wrapping it in a regular ItemWrapper,
						// without citations.
						this.itemMap.set(
							citation.target.key,
							parseWrappedItem(new ItemWrapper(linkedToItem)),
						);
					}
				} else {
					// the citation's target item is not linked to a Zotero item;
					// give it a temporary key, but first make sure it hasn't been
					// given one already (i.e, another source item --that cites the
					// same target item-- has been processed already)

					// collect item's unique identifiers (including name) and clean
					// them, to make sure the same item always gets the same tmp key
					const cleanDOI = Zotero.Utilities.cleanDOI(
						citation.target.doi,
					);
					const cleanISBN = Zotero.Utilities.cleanISBN(
						citation.target.isbn,
					);
					const qid = citation.target.qid;
					const uids = {
						doi: cleanDOI && cleanDOI.toUpperCase(),
						isbn: cleanISBN,
						occ: citation.target.occ, // Fixme: provide OCC cleaning function
						qid: qid && qid.toUpperCase(),
						// based on Zotero.Duplicates.prototype._findDuplicates'
						// normalizeString function
						title: Zotero.Utilities.removeDiacritics(
							citation.target.title,
						)
							// Convert (ASCII) punctuation to spaces
							.replace(/[ !-/:-@[-`{-~]+/g, " ")
							.trim()
							.toLowerCase(),
					};

					// retrieve tmp keys already given to this item,
					// i.e., the target item of another source item's citation
					// had one or more of the same uids or title
					const tmpKeys = new Set();
					for (const [key, value] of Object.entries(uids)) {
						const tmpKey = tmpKeyMap.get(`${key}:${value}`);
						if (tmpKey) tmpKeys.add(tmpKey);
					}

					let tmpKey;
					if (tmpKeys.size === 0) {
						// if no matching temp keys found, create a new one
						do {
							tmpKey =
								"tmp" +
								String(
									Math.round(Math.random() * 100000),
								).padStart(5, "0");
							// make sure randomly created key does not exist already
						} while (this.itemMap.has(tmpKey));
					} else if (tmpKeys.size === 1) {
						// if one matching key found, use that one
						tmpKey = [...tmpKeys][0];
					} else {
						// finding more than one matching key should be unexpected
						throw Error(
							"UIDs of a citation target item should not refer to different temporary item keys",
						);
					}

					// save key to the map of temp keys
					for (const [key, value] of Object.entries(uids)) {
						if (value) tmpKeyMap.set(`${key}:${value}`, tmpKey);
					}

					// add temp key to the citation's target
					wrappedItem.citations[i].target.key = tmpKey;
					// save citation's target to the item map
					// Fixme: if itemMap already has tmpKey, do not overwrite
					// a more complete target item with a less complete one (#72)
					this.itemMap.set(
						tmpKey,
						parseWrappedItem(wrappedItem.citations[i].target),
					);
				}
			}
			this.itemMap.set(wrappedItem.key, parseWrappedItem(wrappedItem));
		}
		this.progress.updateLine("done");
	}

	openItem(key) {
		ZoteroPane.selectItem(
			Zotero.Items.getIDFromLibraryAndKey(this.libraryID, key),
		);
		window.focus();
	}

	async show() {
		const windowFeatures = [
			"chrome",
			"dialog=no",
			"centerscreen",
			"resizable",
			`height=${window.screen.availHeight * 0.9}`,
			`width=${window.screen.availWidth * 0.9}`,
		];
		this.progress.newLine(
			"done",
			Wikicite.getString("wikicite.lcn.show.progress.opening"),
		);
		// A short delay is needed before opening the LCN dialog
		// for the progress new line to show
		await Zotero.Promise.delay(100);

		window.openDialog(
			"chrome://cita/content/Local-Citation-Network/index.html?API=Cita&listOfKeys=" +
				this.inputKeys.join(","),
			"",
			windowFeatures.join(","),
			{
				itemMap: this.itemMap,
				openItem: this.openItem.bind(this),
				openUrl: Zotero.launchURL,
				getString,
			},
		);
		// Fixme: this is in fact returning immediately, but for some reason
		// Zotero gets blocked until the LCN window loads completely
		this.progress.close();
	}
}

/**
 * Get localized string for LCN window
 */
function getString(name, params) {
	name = "wikicite.lcn.window." + name;
	let string;
	if (params) {
		// fix: params need to be named when updating to Fluent instead of .properties
		string = Wikicite.formatString(name, params);
	} else {
		string = Wikicite.getString(name);
	}
	return string;
}

/**
 * Get ItemWrapper and return Data Item as understood by Local Citations Network
 */
function parseWrappedItem(wrappedItem) {
	const authors = wrappedItem.item
		.getCreators()
		.map((creator) => ({ LN: creator.lastName, FN: creator.firstName }));
	if (!authors.length) authors.push({ LN: undefined });
	return {
		id: wrappedItem.key,
		doi: wrappedItem.doi,
		title: wrappedItem.title,
		authors: authors,
		year: wrappedItem.item.getField("year"),
		journal: wrappedItem.item.getField("publicationTitle"),
		references: wrappedItem.citations
			? wrappedItem.citations.map((citation) => citation.target.key)
			: [],
		abstract: wrappedItem.item.getField("abstractNote"),
		url: wrappedItem.url,
	};
}
