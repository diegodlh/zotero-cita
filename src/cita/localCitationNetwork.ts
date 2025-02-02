import ItemWrapper from "./itemWrapper";
import Matcher from "./matcher";
import Progress from "./progress";
import SourceItemWrapper from "./sourceItemWrapper";
import Wikicite from "./wikicite";
import * as prefs from "../cita/preferences";
import { config } from "../../package.json";

function replacer(_key: any, value: any) {
	if (value instanceof Map) {
		return {
			dataType: "Map",
			value: Array.from(value.entries()), // or with spread: value: [...value]
		};
	} else {
		return value;
	}
}

export default class LCN {
	items: Zotero.Item[];
	itemMap: Map<
		string,
		{
			id: string | undefined;
			doi: string | undefined;
			title: string;
			authors: {
				LN: string;
				FN: string;
			}[];
			year: string;
			journal: string;
			references: (string | undefined)[];
			abstract: string;
			url: string | null;
		}
	>;
	inputKeys: string[];
	libraryID: number;
	progress: Progress;

	constructor(items: Zotero.Item[]) {
		if (!items.length)
			throw `Can't create a local citation network without any items`;
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
						) as Zotero.Item;
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
					const uids = citation.target
						.getAllPIDs()
						.map((pid) => pid.comparable) // DOI, ISBN, etc., already in type:value format and cleaned
						.filter((uid) => uid !== undefined); // remove nulls
					// based on Zotero.Duplicates.prototype._findDuplicates'
					// normalizeString function
					const cleanTitle = Zotero.Utilities.removeDiacritics(
						citation.target.title,
					)
						// Convert (ASCII) punctuation to spaces
						.replace(/[ !-/:-@[-`{-~]+/g, " ")
						.trim()
						.toLowerCase();
					uids.push(`title:${cleanTitle}`);

					// retrieve tmp keys already given to this item,
					// i.e., the target item of another source item's citation
					// had one or more of the same uids or title
					const tmpKeys: Set<string> = new Set();
					for (const value of uids) {
						const tmpKey = tmpKeyMap.get(value);
						if (tmpKey) tmpKeys.add(tmpKey);
					}

					let tmpKey: string;
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
						// FIXME: when error is thrown here, progress does not disappear
						// FIXME: should account for cases where there a DOI (section) + ISBN (book) or at least signal them
						// finding more than one matching key should be unexpected
						Zotero.log(`Current item: ${wrappedItem.title}`);
						Zotero.log(
							`Current citation: ${citation.target.title}`,
						);
						Zotero.log(`UIDs: ${JSON.stringify(uids)}`);
						Zotero.log(`tmpKeys: ${JSON.stringify([...tmpKeys])}`);
						Zotero.log(
							`Map: ${JSON.stringify(tmpKeyMap, replacer)}`,
						);
						/*throw Error(
					"UIDs of a citation target item should not refer to different temporary item keys",
					);*/
						tmpKey = [...tmpKeys][0];
					}

					// save key to the map of temp keys
					for (const value of uids) {
						if (value) tmpKeyMap.set(value, tmpKey);
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
			this.itemMap.set(wrappedItem.key!, parseWrappedItem(wrappedItem));
		}
		this.progress.updateLine("done");
	}

	openItem(key: string) {
		ZoteroPane.selectItem(
			Zotero.Items.getIDFromLibraryAndKey(this.libraryID, key) as number,
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
			`chrome://${config.addonRef}/content/Local-Citation-Network/index.html?API=Cita&listOfKeys=` +
				this.inputKeys.join(","),
			"",
			windowFeatures.join(","),
			{
				itemMap: this.itemMap,
				openItem: this.openItem.bind(this),
				openUrl: Zotero.launchURL,
				getString,
				saveFile,
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
function getString(name: string, params: unknown) {
	name = "wikicite.lcn.window." + name;
	let string;
	if (params) {
		string = Wikicite.formatString(name, params);
	} else {
		string = Wikicite.getString(name);
	}
	return string;
}

/**
 * Open FilePicker for saving CSV or RIS / JSON (can be re-opened on https://LocalCitationNetwork.github.io)
 */
async function saveFile (content: string, filename: string) {
	const FilePicker = Zotero.getMainWindow().FilePicker;
	const fp = new FilePicker();
	fp.init(window, "Save File", fp.modeSave);
	fp.defaultString = filename;
	
	// Filter FilePicker dialogue by filetype, which depends on filename-suffix
	const typeMatch = filename.match(/\.(\w+)$/);
	if (typeMatch) {
		const type = typeMatch[1];
		fp.appendFilter(type.toUpperCase(), "*." + type);
		fp.defaultExtension = type;
	}
	
	const rv = await fp.show();
	if (rv === fp.returnOK || rv === fp.returnReplace) {
		const file = Zotero.File.pathToFile(fp.file);
		await Zotero.File.putContentsAsync(file, content);
		return true;
	}
	return false;
}

/**
 * Get ItemWrapper and return Data Item as understood by Local Citations Network
 */
function parseWrappedItem(wrappedItem: ItemWrapper | SourceItemWrapper) {
	const authors = wrappedItem.item
		.getCreators()
		.map((creator) => ({ LN: creator.lastName, FN: creator.firstName }));
	if (!authors.length) authors.push({ LN: "", FN: "" });
	return {
		id: wrappedItem.key,
		doi: wrappedItem.doi,
		title: wrappedItem.title,
		authors: authors,
		year: wrappedItem.item.getField("year"),
		journal: wrappedItem.item.getField("publicationTitle"),
		references:
			"citations" in wrappedItem
				? wrappedItem.citations.map((citation) => citation.target.key)
				: [],
		abstract: wrappedItem.item.getField("abstractNote"),
		url: wrappedItem.url,
	};
}
