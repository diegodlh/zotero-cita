import Wikicite from "./wikicite";
import Citations from "./citations";
import CitationsBoxContainer from "../containers/citationsBoxContainer";
import Crossref from "./crossref";
import Extraction from "./extract";
import LCN from "./localCitationNetwork";
import OCI from "../oci";
import OpenCitations from "./opencitations";
import * as React from "react";
// https://react.dev/blog/2022/03/08/react-18-upgrade-guide#updates-to-client-rendering-apis
import { Root, createRoot } from "react-dom/client";
import SourceItemWrapper from "./sourceItemWrapper";
import WikiciteChrome from "./wikiciteChrome";
import Wikidata from "./wikidata";
import { config } from "../../package.json";
import ItemWrapper from "./itemWrapper";
import * as prefs from "./preferences";

import { initLocale, getLocaleID } from "../utils/locale";
import { getPrefGlobalName } from "../utils/prefs";

const TRANSLATORS_PATH = `chrome://${config.addonRef}/content/translators`;
const TRANSLATOR_LABELS = [
	"Wikidata API",
	"Wikidata JSON",
	"zotkat/Wikidata QuickStatements",
];

const ITEM_PANE_COLUMN_IDS = {
	QID: "qid",
	CITATIONS: "citations",
};

declare type MenuFunction =
	| "fetchQIDs"
	| "syncWithWikidata"
	| "getFromCrossref"
	| "getFromOCC"
	| "getFromAttachments"
	| "addAsCitations"
	| "localCitationNetwork";

declare type MenuSelectionType = "item" | "collection";
// declare const Components: any;

// Components.utils.import("resource://gre/modules/AddonManager.jsm");
// Components.utils.import("resource://zotero/config.js");

// // needed as a separate function, because zoteroOverlay.refreshZoteroPopup refers to `this`, and a bind would make it
// // two separate functions in add/remove eventlistener
// function refreshItemSubmenu() {
//     zoteroOverlay.refreshZoteroPopup('item', document);
// }
// function refreshCollectionSubmenu() {
//     zoteroOverlay.refreshZoteroPopup('collection', document);
// }

// function refreshCitationsPane(event: Event) {
//     // if (event.target !== 'zotero-view-item') {
//     //     zoteroOverlay.refreshCitationsPane(document, event.target);
//     // }
//     let target;
//     if (event) {
//         target = event.target;
//     } else {
//         // if listener is called via an object's runListeners method,
//         // it is called without an event,
//         // but with the object as the listener's this value
//         target = { id: this.id }
//     }
//     zoteroOverlay.refreshCitationsPane(document, target);
// }

// function updateCitationsBoxSize() {
//     zoteroOverlay.updateCitationsBoxSize(document);
// }

class ZoteroOverlay {
	qidColumnID?: string | false;
	numCitationsColumnID?: string | false;
	_sourceItem?: SourceItemWrapper;
	_citationIndex?: number;
	preferenceUpdateObservers?: symbol[];
	/******************************************/
	// Window load handling
	/******************************************/
	constructor(win: Window) {
		// retrieve and set addon version
		// AddonManager.getAddonByID(Wikicite.id, (addon: any) => {
		//     Wikicite.version = addon.version
		// });

		initLocale();

		this.setDefaultPreferences();

		this.fullOverlay();

		this.addItemPaneColumns();

		this.addPreferenceUpdateObservers();

		// // refresh item and collection submenus each time they show
		window.document
			.getElementById("zotero-itemmenu")
			?.addEventListener(
				"popupshowing",
				(event) => this.refreshZoteroPopup("item", window.document),
				false,
			);
		// ?.addEventListener("popupshowing", refreshItemSubmenu, false);
		window.document
			.getElementById("zotero-collectionmenu")
			?.addEventListener(
				"popupshowing",
				(event) =>
					this.refreshZoteroPopup("collection", window.document),
				false,
			);
		// ?.addEventListener("popupshowing", refreshCollectionSubmenu, false);

		// // document.getElementById('zotero-view-tabbox').addEventListener('select', refreshCitationsPane, false);
		// document.getElementById('zotero-editpane-tabs').addEventListener('select', refreshCitationsPane, false);
		// Zotero.uiReadyPromise.then(
		//     () => {
		//         debug('Adding refreshCitationsPane listener to ZoteroPane.itemsView "select" listeners');
		//         ZoteroPane.itemsView.onSelect.addListener(refreshCitationsPane);
		//     }
		// );

		// // Update citations box list height...
		// // Fixme: Try and solve this using CSS alone!
		// // ...when window resizes,
		// window.addEventListener('resize', updateCitationsBoxSize);
		// // ...splitter is moved,
		// document.getElementById('zotero-items-splitter').addEventListener('mousemove', updateCitationsBoxSize, false);
		// document.getElementById('zotero-items-splitter').addEventListener('command', updateCitationsBoxSize, false);
		// // ...layout is changed
		// const observer = new MutationObserver(
		//     (mutationsList, observer) => {
		//         for (const mutation of mutationsList) {
		//             if (mutation.attributeName == 'orient') {
		//                 updateCitationsBoxSize();
		//             }
		//         }
		//     }
		// );
		// observer.observe(
		//     document.getElementById('zotero-layout-switcher'),
		//     { attributes: true }
		// );
		// this.switcherObserver = observer;

		this.installTranslators();

		// this.addNewTabListener()
	}

	unload() {
		this.removeOverlay();

		this.removeItemPaneColumns();

		this.removePreferenceUpdateObservers();

		// // This event listener is never added
		// // var toolsPopup = document.getElementById('menu_ToolsPopup')
		// // toolsPopup.removeEventListener('popupshowing',
		// //     zoteroOverlay.prefsSeparatorListener, false)
		// document.getElementById('zotero-itemmenu').removeEventListener(
		//     'popupshowing', refreshItemSubmenu, false
		// );
		// document.getElementById('zotero-collectionmenu').removeEventListener(
		//     'popupshowing', refreshCollectionSubmenu, false
		// );
		// document.getElementById('zotero-editpane-tabs').removeEventListener('select', refreshCitationsPane, false)
		// // todo: find a better way to remove event listener
		// // https://groups.google.com/g/zotero-dev/c/_HDsAc5HPac
		// let itemsViewSelectListeners;
		// if (ZoteroPane.itemsView._listeners) {
		//     itemsViewSelectListeners = ZoteroPane.itemsView._listeners.select
		// } else if (ZoteroPane.itemsView._events && ZoteroPane.itemsView._events.select) {
		//     // JSX-ified ZoteroPane
		//     itemsViewSelectListeners = ZoteroPane.itemsView._events.select.listeners
		// }
		// if (itemsViewSelectListeners) {
		//     debug('Removing refreshCitationsPane listener from ZoteroPane.itemsView "select" event listeners');
		//     itemsViewSelectListeners.delete(refreshCitationsPane);
		// }
		// window.removeEventListener('resize', updateCitationsBoxSize);
		// document.getElementById('zotero-items-splitter').removeEventListener('mousemove', updateCitationsBoxSize, false);
		// document.getElementById('zotero-items-splitter').removeEventListener('command', updateCitationsBoxSize, false);
		// this.switcherObserver.disconnect();
		this.uninstallTranslators();
		// this.removeNewTabListener()
	}

	/******************************************/
	// Preferences
	/******************************************/
	setDefaultPreferences() {
		prefs.initialiseStorage();
		prefs.initialiseSortBy();
	}

	addPreferenceUpdateObservers() {
		this.preferenceUpdateObservers = [
			Zotero.Prefs.registerObserver(
				getPrefGlobalName(prefs.STORAGE_PREF_KEY),
				(value: prefs.StorageType) => {
					switch (value) {
						case "extra":
							prefs.migrateStorageLocation("note", "extra");
							break;
						case "note":
							prefs.migrateStorageLocation("extra", "note");
							break;
					}
				},
				true,
			),
		];
	}

	removePreferenceUpdateObservers() {
		if (this.preferenceUpdateObservers) {
			for (const preferenceUpdateObserverSymbol of this
				.preferenceUpdateObservers) {
				Zotero.Prefs.unregisterObserver(preferenceUpdateObserverSymbol);
			}
			this.preferenceUpdateObservers = undefined;
		}
	}

	/******************************************/
	// Modifying Item Pane
	/******************************************/
	async addItemPaneColumns() {
		this.qidColumnID = await Zotero.ItemTreeManager.registerColumns({
			dataKey: ITEM_PANE_COLUMN_IDS.QID,
			label: Wikicite.getString("wikicite.item-tree.column-label.qid"),
			pluginID: config.addonID,
			dataProvider: (item: Zotero.Item, dataKey: string) => {
				return item.isRegularItem()
					? new SourceItemWrapper(item, prefs.getStorage()).getPID(
							"QID",
						) || ""
					: "";
			},
		});

		// fix: this doesn't update immediately when removing citations
		this.numCitationsColumnID =
			await Zotero.ItemTreeManager.registerColumns({
				dataKey: ITEM_PANE_COLUMN_IDS.CITATIONS,
				label: Wikicite.getString(
					"wikicite.item-tree.column-label.citations",
				),
				pluginID: config.addonID,
				dataProvider: (item: Zotero.Item, dataKey: string) => {
					return item.isRegularItem()
						? new SourceItemWrapper(
								item,
								prefs.getStorage(),
							).citations.length.toString() || ""
						: "";
				},
			});
	}

	removeItemPaneColumns() {
		if (this.qidColumnID) {
			void Zotero.ItemTreeManager.unregisterColumns(this.qidColumnID);
		}
		if (this.numCitationsColumnID) {
			void Zotero.ItemTreeManager.unregisterColumns(
				this.numCitationsColumnID,
			);
		}
	}

	/******************************************/
	// Notifiers
	/******************************************/
	// Listen for the creation of a new PDF reader tab, then add the citations menu to it

	// addNewTabListener () {
	//     this.notifierID = Zotero.Notifier.registerObserver(this.tabEventCallback, ["tab"])
	// },

	// removeNewTabListener () {
	//     Zotero.Notifier.unregisterObserver(this.notifierID);
	// },

	// Approach from Zotero PDF Translate
	// https://github.com/windingwind/zotero-pdf-translate/blob/307b6e4169a925d4152a0dc0bb88fdeba238222e/src/events.ts#L21
	tabEventCallback() {
		// async notify (event: string, type: string, ids: string[], extraData: { [key: string]: any }) {
		//     // adding the Citations menu when selecting a tab for the first time seems
		//     // more robust than doing it when the tab is created
		//     if (event == "select" && type == "tab" && extraData[ids[0]].type == "reader") {
		//         let reader = Zotero.Reader.getByTabID(ids[0]);
		//         let delayCount = 0;
		//         // Wait for the reader tab to be ready
		//         while (!reader && delayCount < 10) {
		//             await Zotero.Promise.delay(100);
		//             reader = Zotero.Reader.getByTabID(ids[0]);
		//             delayCount++;
		//         }
		//         await reader?._initPromise;
		//         // Only add a citations tab if the PDF has a parent item to add citations to
		//         if (Zotero.Items.get(reader.itemID).parentItem) {
		//             const pdfReaderTabbox = document.getElementById(`${ids[0]}-context`).querySelector(".zotero-view-tabbox") as HTMLElement;
		//             // only add the citations pane and refresh listener to this tab if they aren't already
		//             if (!pdfReaderTabbox.querySelector('#citations-pane')) {
		//                 zoteroOverlay.citationsPane(document, pdfReaderTabbox);
		//                 pdfReaderTabbox.querySelector('.zotero-editpane-tabs').addEventListener('select', refreshCitationsPane, false);
		//             }
		//         }
		//     }
		// }
	}

	/******************************************/
	// Translators
	/******************************************/
	// based on Better BibTex translators

	async installTranslators() {
		// Wait until Zotero.Translators is ready
		await Zotero.Schema.schemaUpdatePromise;
		for (const label of TRANSLATOR_LABELS) {
			void this.installTranslator(label);
		}
		Zotero.Translators.reinit();
	}

	uninstallTranslators() {
		for (const label of TRANSLATOR_LABELS) {
			this.uninstallTranslator(label);
		}
		Zotero.Translators.reinit();
	}

	async installTranslator(label: string) {
		const source = Zotero.File.getContentsFromURL(
			`${TRANSLATORS_PATH}/${label}.js`,
		);
		const header = /^\s*{[\S\s]*?}\s*?[\r\n]/.exec(source)?.[0];
		if (header === undefined) {
			ztoolkit.log(
				`Failed to install translator ${label} - couldn't find header`,
			);
			return;
		}
		const metadata = JSON.parse(header);
		const code = source.replace(header, "");
		const installed = Zotero.Translators.get(metadata.translatorID);
		if (installed) {
			const newDate = new Date(metadata.lastUpdated);
			const oldDate = new Date(installed.lastUpdated);
			if (oldDate > newDate) {
				// do not install
				ztoolkit.log("Skipping installation of translator " + label);
				return;
			}
		}
		try {
			await Zotero.Translators.save(metadata, code);
			ztoolkit.log(`Installed translator ${label}`);
		} catch (err) {
			ztoolkit.log(`Failed to install translator ${label}`, err as Error);
			this.uninstallTranslator(label);
		}
	}

	uninstallTranslator(label: string) {
		try {
			const fileName = Zotero.Translators.getFileNameFromLabel(label);
			const destFile = Zotero.getTranslatorsDirectory();
			destFile.append(fileName);
			if (destFile.exists()) {
				destFile.remove(false);
			}
			ztoolkit.log(`Uninstalled translator ${label}`);
		} catch (err) {
			ztoolkit.log(`Failed to remove translator ${label}`, err as Error);
		}
	}

	/******************************************/
	// Functions for item tree batch actions
	/******************************************/
	/**
	 * Return selected regular items
	 * @param {String} menuName Zotero popup menu firing the action: 'item' or 'collection'
	 * @param {Boolean} [wrap=true] Whether to return wrapped items or not
	 * @return {Array} Array of selected regular items
	 */
	async getSelectedItems(
		menuName: MenuSelectionType,
		wrap: false,
	): Promise<Zotero.Item[]>;
	async getSelectedItems(
		menuName: MenuSelectionType,
		wrap: true,
	): Promise<SourceItemWrapper[]>;
	async getSelectedItems(menuName: MenuSelectionType, wrap: boolean = true) {
		// Fixme: Consider using the Citations class methods instead
		let items;
		switch (menuName) {
			case "item": {
				items = ZoteroPane.getSelectedItems();
				break;
			}
			case "collection": {
				const collectionTreeRow = ZoteroPane.getCollectionTreeRow();
				if (collectionTreeRow?.isCollection()) {
					const collection = ZoteroPane.getSelectedCollection();
					items = collection?.getChildItems();
				} else if (
					collectionTreeRow?.isLibrary() ||
					collectionTreeRow?.isGroup()
				) {
					// Also account for group libraries #193
					const libraryID = ZoteroPane.getSelectedLibraryID();
					items = await Zotero.Items.getAll(libraryID);
				}
				break;
			}
		}
		if (items) {
			items = items.filter((item: any) => item.isRegularItem());
			if (wrap)
				items = items.map(
					(item: any) =>
						new SourceItemWrapper(item, prefs.getStorage()),
				);
			return items;
		} else {
			return [];
		}
	}

	async fetchQIDs(menuName: MenuSelectionType) {
		const items = await this.getSelectedItems(menuName, true);
		const qidMap = await Wikidata.reconcile(items);
		if (qidMap) {
			for (const item of items) {
				const qid = qidMap.get(item);
				if (qid) item.qid = qid;
			}
		}
	}

	async syncWithWikidata(menuName: MenuSelectionType) {
		const items = await this.getSelectedItems(menuName, true);
		if (items.length) {
			Citations.syncItemCitationsWithWikidata(items);
		}
	}

	getFromCrossref(menuName: MenuSelectionType) {
		// get items selected
		// filter items with doi
		// generate batch call to crossref
		// only add items not available locally yet
		Crossref.getCitations();
	}

	getFromOCC(menuName: MenuSelectionType) {
		OpenCitations.getCitations();
	}

	getFromAttachments(menuName: MenuSelectionType) {
		// I don't think there's a need to batch call the extractor here
		// get selected items
		// filter by items with attachments
		// call the extract method once per item
		// maybe call it in a way it doesn't fail if pdf is not readable
		// call it with one pdf
		Extraction.extract();
	}

	addAsCitations(menuName: MenuSelectionType) {
		// Add items selected as citation target items of one or more source items
		// 1. open selectItemsDialog.xul; allow one or more item selection
		// 2. create citation objects for each of the target items selected
		// 3. for each of the source items selected, wrap it into a SourceItemWrapper
		// 4. run addCitations and pass it the citation objects created above
		// 5. finally, link citations to the Zotero items
		// see #39
		Services.prompt.alert(
			window as mozIDOMWindowProxy,
			Wikicite.getString("wikicite.global.unsupported"),
			Wikicite.getString("wikicite.citations.from-items.unsupported"),
		);
	}

	async localCitationNetwork(menuName: MenuSelectionType) {
		const items = await this.getSelectedItems(menuName, false);
		if (items.length) {
			const lcn = new LCN(items);
			await lcn.init();
			lcn.show();
		}
	}

	/******************************************/
	// XUL overlay functions
	/******************************************/
	fullOverlay() {
		// Add all Wikicite overlay elements to the window
		this.overlayZoteroPane(document);
	}

	overlayZoteroPane(doc: Document) {
		const prefOptions = {
			pluginID: config.addonID,
			src: `chrome://${config.addonRef}/content/preferences.xhtml`,
			label: Wikicite.getString("wikicite.global.name"),
			image: `chrome://${config.addonRef}/content/skin/default/cita.svg`,
			defaultXUL: true,
		};
		ztoolkit.PreferencePane.register(prefOptions);

		// // add wikicite submenu to item and collection menus
		this.zoteroPopup("item", doc);
		this.zoteroPopup("collection", doc);

		// Add Citations tab to item pane
		this.citationsPane();

		this.addOverlayStyleSheet();

		// Add popup menus to main window
		const mainWindow = doc.getElementById("main-window");
		this.itemPopupMenu(doc, mainWindow!);
		this.citationPopupMenu(doc, mainWindow!);
	}

	removeOverlay() {
		this.removeOverlayStyleSheet();
	}

	addOverlayStyleSheet() {
		// todo: it should be possible to just import this and have esbuild work it out
		// but I couldn't get that to work, so add the CSS manually.
		const link = window.document.createElement("link");
		link.id = `${config.addonRef}-overlay-stylesheet`;
		link.rel = "stylesheet";
		link.href = `chrome://${config.addonRef}/content/skin/default/overlay.css`;
		window.document.documentElement.appendChild(link);
	}

	removeOverlayStyleSheet() {
		window.document
			.getElementById(`${config.addonRef}-overlay-stylesheet`)
			?.remove();
	}

	/******************************************/
	// Item pane functions
	/******************************************/
	// Create XUL for Zotero item pane
	citationsPane() {
		// todo: remove when unloading
		const citationBoxRoots: {
			[id: string]: Root;
		} = {};
		Zotero.ItemPaneManager.registerSection({
			paneID: "zotero-editpane-citations-tab",
			pluginID: config.addonID,
			header: {
				l10nID: getLocaleID("wikicite-citations-pane"),
				icon: `chrome://${config.addonRef}/content/skin/default/cita-small.svg`,
			},
			sidenav: {
				l10nID: getLocaleID("wikicite-citations-pane"),
				icon: `chrome://${config.addonRef}/content/skin/default/cita-small.svg`,
			},
			bodyXHTML: `<html:div id="citations-box-container" xmlns:html="http://www.w3.org/1999/xhtml"></html:div>`,
			onInit: ({ body, refresh }) => {
				// We get a react error if we try to create a root on the same HTML Element more than once
				// so we need to keep track of each separate item pane's root so we can re-render it when the item changes
				// we do this because each tab (library and every reader) has a unique tab_id that we can get by walking
				// up the DOM from the body
				const tab_id: string =
					body.parentElement?.parentElement?.parentElement
						?.parentElement?.parentElement?.parentElement?.id!;
				citationBoxRoots[tab_id] = createRoot(
					body.firstChild! as Element,
				);
			},
			onRender: ({ body, item }) => {
				if (!item.isRegularItem()) {
					return;
				}
				const tab_id: string =
					body.parentElement?.parentElement?.parentElement
						?.parentElement?.parentElement?.parentElement?.id!;
				citationBoxRoots[tab_id].render(
					<CitationsBoxContainer
						key={"citationsBox-" + item.id}
						item={item}
						editable={
							ZoteroPane.collectionsView
								? ZoteroPane.collectionsView.editable
								: true
						}
					/>,
				);
			},
			onItemChange: ({ item, setEnabled }) => {
				setEnabled(item.isRegularItem());
			},
		});
	}

	// Item-wide popup menu (More...)
	itemPopupMenu(doc: Document, mainWindow: Element) {
		const ns =
			"http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
		const itemMenu = doc.createElementNS(ns, "menupopup");
		const itemMenuID = "citations-box-item-menu";
		itemMenu.setAttribute("id", itemMenuID);
		itemMenu.addEventListener("popupshowing", () =>
			this.handleItemPopupShowing(doc),
		);

		// Sync with Wikidata menu item

		const itemWikidataSync = doc.createElementNS(ns, "menuitem");
		itemWikidataSync.setAttribute("id", "item-menu-wikidata-sync");
		itemWikidataSync.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.sync-wikidata"),
		);
		itemWikidataSync.addEventListener("command", () =>
			this._sourceItem!.syncWithWikidata(),
		);

		// Fetch QIDs menu item

		const itemFetchCitationQIDs = doc.createElementNS(ns, "menuitem");
		itemFetchCitationQIDs.setAttribute(
			"id",
			"item-menu-fetch-citation-qids",
		);
		itemFetchCitationQIDs.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.fetch-citation-qids"),
		);
		itemFetchCitationQIDs.addEventListener("command", () =>
			this._sourceItem!.fetchCitationQIDs(),
		);

		// Get Crossref citations menu item

		const itemCrossrefGet = doc.createElementNS(ns, "menuitem");
		itemCrossrefGet.setAttribute("id", "item-menu-crossref-get");
		itemCrossrefGet.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.get-crossref"),
		);
		itemCrossrefGet.addEventListener("command", () =>
			this._sourceItem!.getFromCrossref(),
		);

		// Get OCC citations menu item

		const itemOccGet = doc.createElementNS(ns, "menuitem");
		itemOccGet.setAttribute("id", "item-menu-occ-get");
		itemOccGet.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.get-occ"),
		);
		itemOccGet.addEventListener("command", () =>
			this._sourceItem!.getFromOcc(),
		);

		// Extract citations menu item

		const itemPdfExtract = doc.createElementNS(ns, "menuitem");
		itemPdfExtract.setAttribute("id", "item-menu-pdf-extract");
		itemPdfExtract.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.get-pdf"),
		);
		itemPdfExtract.addEventListener("command", () =>
			this._sourceItem!.getFromPDF(),
		);

		// Add citations by identifier menu item

		const itemIdentifierImport = doc.createElementNS(ns, "menuitem");
		itemIdentifierImport.setAttribute("id", "item-menu-identifier-import");
		itemIdentifierImport.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.import-identifier"),
		);
		itemIdentifierImport.addEventListener("command", () =>
			this._sourceItem!.addCitationsByIdentifier(),
		);

		// Import citations menu item

		const itemCitationsImport = doc.createElementNS(ns, "menuitem");
		itemCitationsImport.setAttribute("id", "item-menu-citations-import");
		itemCitationsImport.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.import-citations"),
		);
		itemCitationsImport.addEventListener("command", () =>
			this._sourceItem!.importCitations(),
		);

		// Export to file menu item

		const itemFileExport = doc.createElementNS(ns, "menuitem");
		itemFileExport.setAttribute("id", "item-menu-file-export");
		itemFileExport.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.export-file"),
		);
		itemFileExport.addEventListener("command", () =>
			this._sourceItem!.exportToFile(),
		);

		// Export to CROCI menu item

		const itemCrociExport = doc.createElementNS(ns, "menuitem");
		itemCrociExport.setAttribute("id", "item-menu-croci-export");
		itemCrociExport.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.export-croci"),
		);
		itemCrociExport.addEventListener("command", () =>
			this._sourceItem!.exportToCroci(),
		);

		// Sort-by submenu

		const menuSort = doc.createElementNS(ns, "menu");
		menuSort.setAttribute("id", "item-menu-sort-submenu");
		menuSort.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.sort"),
		);

		const sortPopup = doc.createElementNS(ns, "menupopup");
		sortPopup.setAttribute("id", "item-menu-sort-submenu-popup");

		menuSort.appendChild(sortPopup);

		const sortValues: prefs.SortByType[] = [
			"ordinal",
			"authors",
			"date",
			"title",
		];
		const sortByValue = prefs.getSortBy();
		for (const value of sortValues) {
			const itemSort = doc.createElementNS(ns, "menuitem");
			itemSort.setAttribute("id", "item-menu-sort-" + value);
			itemSort.setAttribute(
				"label",
				Wikicite.getString("wikicite.item-menu.sort." + value),
			);
			itemSort.setAttribute("type", "radio");
			if (value === sortByValue) {
				itemSort.setAttribute("checked", "true");
			}
			itemSort.addEventListener("command", () => prefs.setSortBy(value));
			sortPopup.appendChild(itemSort);
		}

		// Auto-link citations menu item

		const autoLinkCitations = doc.createElementNS(ns, "menuitem");
		autoLinkCitations.setAttribute("id", "item-menu-autolink-citations");
		autoLinkCitations.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.autolink-citations"),
		);
		autoLinkCitations.addEventListener("command", () =>
			this._sourceItem!.autoLinkCitations(),
		);

		itemMenu.appendChild(itemWikidataSync);
		itemMenu.appendChild(itemFetchCitationQIDs);
		itemMenu.appendChild(itemCrossrefGet);
		itemMenu.appendChild(itemOccGet);
		itemMenu.appendChild(itemPdfExtract);
		itemMenu.appendChild(itemIdentifierImport);
		itemMenu.appendChild(itemCitationsImport);
		itemMenu.appendChild(itemFileExport);
		itemMenu.appendChild(itemCrociExport);
		itemMenu.appendChild(menuSort);
		itemMenu.appendChild(autoLinkCitations);

		mainWindow.appendChild(itemMenu);
		WikiciteChrome.registerXUL(itemMenuID, doc);
	}

	// Citation-specific popup menu
	citationPopupMenu(doc: Document, mainWindow: Element) {
		const ns =
			"http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
		const citationMenu = doc.createElementNS(ns, "menupopup");
		const citationMenuID = "citations-box-citation-menu";
		citationMenu.setAttribute("id", citationMenuID);
		citationMenu.addEventListener("popupshowing", () =>
			this.handleCitationPopupShowing(doc),
		);

		const citationWikidataSync = doc.createElementNS(ns, "menuitem");
		citationWikidataSync.setAttribute("id", "citation-menu-wikidata-sync");
		citationWikidataSync.setAttribute(
			"label",
			Wikicite.getString("wikicite.citation-menu.sync-wikidata"),
		);
		citationWikidataSync.addEventListener("command", () =>
			this._sourceItem!.syncWithWikidata(this._citationIndex),
		);

		const citationFetchQID = doc.createElementNS(ns, "menuitem");
		citationFetchQID.setAttribute("id", "citation-menu-fetch-qid");
		citationFetchQID.setAttribute(
			"label",
			Wikicite.getString("wikicite.citation-menu.fetch-qid"),
		);
		citationFetchQID.addEventListener("command", () =>
			this._sourceItem!.fetchCitationQIDs(this._citationIndex),
		);

		const itemFileExport = doc.createElementNS(ns, "menuitem");
		itemFileExport.setAttribute("id", "citation-menu-file-export");
		itemFileExport.setAttribute(
			"label",
			Wikicite.getString("wikicite.citation-menu.export-file"),
		);
		itemFileExport.addEventListener("command", () =>
			this._sourceItem!.exportToFile(this._citationIndex),
		);

		const itemCrociExport = doc.createElementNS(ns, "menuitem");
		itemCrociExport.setAttribute("id", "citation-menu-croci-export");
		itemCrociExport.setAttribute(
			"label",
			Wikicite.getString("wikicite.citation-menu.export-croci"),
		);
		itemCrociExport.addEventListener("command", () =>
			this._sourceItem!.exportToCroci(this._citationIndex),
		);

		// Fixme: but OCI has two more suppliers: Dryad and CROCI
		// Maybe I should have all of them, and show only the available ones
		// for any one citation?
		const ociMenu = doc.createElementNS(ns, "menu");
		ociMenu.setAttribute("id", "citation-menu-oci-submenu");
		ociMenu.setAttribute(
			"label",
			Wikicite.getString("wikicite.citation-menu.oci"),
		);

		const ociPopup = doc.createElementNS(ns, "menupopup");
		ociPopup.setAttribute("id", "citation-menu-oci-submenu-popup");
		ociMenu.appendChild(ociPopup);

		for (const supplier of ["crossref", "occ", "wikidata"]) {
			const ociItem = doc.createElementNS(ns, "menuitem");
			ociItem.setAttribute("id", "citation-menu-oci-" + supplier);
			ociItem.setAttribute(
				"label",
				Wikicite.getString("wikicite.citation-menu.oci." + supplier),
			);
			ociItem.addEventListener("command", () =>
				this._sourceItem!.citations[this._citationIndex!].resolveOCI(
					supplier,
				),
			);
			ociPopup.appendChild(ociItem);
		}

		citationMenu.appendChild(citationWikidataSync);
		citationMenu.appendChild(citationFetchQID);
		citationMenu.appendChild(itemFileExport);
		citationMenu.appendChild(itemCrociExport);
		citationMenu.appendChild(ociMenu);

		mainWindow.appendChild(citationMenu);
		WikiciteChrome.registerXUL(citationMenuID, doc);
	}

	// refreshCitationsPane (document: Document, target: any) {
	//     let item: any, zoteroViewTabbox: HTMLSelectElement, editPaneTabs: HTMLElement;
	//     // different ways of getting the selected item if we're in the library or PDF reader
	//     const selectedTab = Zotero_Tabs._tabs[Zotero_Tabs.selectedIndex];
	//     if (selectedTab.type == "library") {
	//         const selectedItems = ZoteroPane.getSelectedItems();
	//         if (selectedItems.length == 1) {
	//             item = selectedItems[0];
	//         }
	//         zoteroViewTabbox = document.getElementById('zotero-view-tabbox') as HTMLSelectElement; // chose this type for compatibility with .selectedIndex below
	//         editPaneTabs = document.getElementById('zotero-editpane-tabs');
	//     }
	//     else if (selectedTab.type == "reader") {
	//         item = Zotero.Items.get(selectedTab.data.itemID).parentItem;
	//         zoteroViewTabbox = document.querySelector(`#${selectedTab.id}-context .zotero-view-tabbox`);
	//         editPaneTabs = document.querySelector(`#${selectedTab.id}-context .zotero-editpane-tabs`);
	//     }

	//     if (item && item.isRegularItem() && !item.isFeedItem) {
	//         const citationsTabIndex = Array.from(editPaneTabs.children).findIndex(child => child.id === 'zotero-editpane-citations-tab');
	//         if (zoteroViewTabbox.selectedIndex === citationsTabIndex) {
	//             // fix: runs twice when tab is changed to Citations
	//             debug(`Refreshing citations pane... (${target.id})`);
	//             const t0 = performance.now();
	//             ReactDOM.render(
	//                 <CitationsBoxContainer
	//                     //Having the key change, makes the CitationsBoxContainer
	//                     //component unmount when the item selected changes
	//                     key={"citationsBox-" + item.id}
	//                     item={item}
	//                     editable={ZoteroPane.collectionsView.editable}
	//                 // fix: had to comment out for TS
	//                 // onSourceItem={this.handleSourceItem}
	//                 // citationIndexRef={this._citationIndex}
	//                 // In principle I don't need a ref; I may have to use it if I need to force blur
	//                 // ref={_citationsBox}
	//                 // onResetSelection={focusItemsList}
	//                 />,
	//                 zoteroViewTabbox.querySelector('#citations-box-container'), // only the active one appears
	//                 () => this.updateCitationsBoxSize(document)
	//             );
	//             const t1 = performance.now();
	//             debug(`Rendering CitationsBoxContainer took ${t1 - t0}ms.`);
	//         }
	//     }
	// },

	// Fixme: make zoteroOverlay a class and this a getter/setter property
	setSourceItem(sourceItem: SourceItemWrapper) {
		this._sourceItem = sourceItem;
	}

	setCitationIndex(citationIndex: number) {
		this._citationIndex = citationIndex;
	}

	handleItemPopupShowing(document: Document) {
		const sourceItem = this._sourceItem;

		const hasAttachments = Boolean(
			sourceItem!.item.getAttachments().length,
		);
		const hasCitations = Boolean(sourceItem!.citations.length);
		const sourceDoi = sourceItem!.doi;
		const sourceOcc = sourceItem!.occ;
		const sourceQid = sourceItem!.qid;

		const itemWikidataSync = document.getElementById(
			"item-menu-wikidata-sync",
		) as HTMLButtonElement; //actually a menuitem, but Button is close
		const itemFetchCitationQIDs = document.getElementById(
			"item-menu-fetch-citation-qids",
		) as HTMLButtonElement;
		const itemCrossrefGet = document.getElementById(
			"item-menu-crossref-get",
		) as HTMLButtonElement;
		const itemOccGet = document.getElementById(
			"item-menu-occ-get",
		) as HTMLButtonElement;
		const itemPdfExtract = document.getElementById(
			"item-menu-pdf-extract",
		) as HTMLButtonElement;
		const itemIdentifierImport = document.getElementById(
			"item-menu-identifier-import",
		) as HTMLButtonElement;
		const itemCitationsImport = document.getElementById(
			"item-menu-citations-import",
		) as HTMLButtonElement;
		const itemFileExport = document.getElementById(
			"item-menu-file-export",
		) as HTMLButtonElement;
		const itemCrociExport = document.getElementById(
			"item-menu-croci-export",
		) as HTMLButtonElement;

		itemWikidataSync.disabled = !sourceQid;
		itemFetchCitationQIDs.disabled = !hasCitations;
		itemCrossrefGet.disabled = !sourceDoi;
		itemOccGet.disabled = !sourceOcc;
		itemPdfExtract.disabled = !hasAttachments;
		itemCitationsImport.disabled = false;
		itemFileExport.disabled = !hasCitations;
		itemIdentifierImport.disabled = false;
		itemCrociExport.disabled = !hasCitations;
	}

	handleCitationPopupShowing(doc: Document) {
		const sourceItem = this._sourceItem;
		const citation = sourceItem?.citations[this._citationIndex!];
		const targetItem = citation?.target;

		const ociSuppliers = citation?.ocis.map((oci) => oci.supplierName);

		(
			doc.getElementById(
				"citation-menu-wikidata-sync",
			) as HTMLButtonElement
		).disabled = !sourceItem?.qid || !targetItem?.qid;
		(
			doc.getElementById("citation-menu-fetch-qid") as HTMLButtonElement
		).disabled = false;
		(
			doc.getElementById("citation-menu-file-export") as HTMLButtonElement
		).disabled = false;
		(
			doc.getElementById(
				"citation-menu-croci-export",
			) as HTMLButtonElement
		).disabled = !sourceItem?.doi || !targetItem?.doi;
		(
			doc.getElementById(
				"citation-menu-oci-crossref",
			) as HTMLButtonElement
		).disabled = !ociSuppliers?.includes("crossref");
		(
			doc.getElementById("citation-menu-oci-occ") as HTMLButtonElement
		).disabled = !ociSuppliers?.includes("occ");
		(
			doc.getElementById(
				"citation-menu-oci-wikidata",
			) as HTMLButtonElement
		).disabled = !ociSuppliers?.includes("wikidata");
	}

	// /**
	//  * Set an explicit height on the citations list
	//  *
	//  * Revisit when Zotero is all HTML.
	//  */
	// updateCitationsBoxSize (document: Document) {
	//     // Based on ZoteroPane.updateTagsBoxSize()
	//     // check whether we're in the library or PDF Reader
	//     let citationBoxParent;
	//     const selectedTab = Zotero_Tabs._tabs[Zotero_Tabs.selectedIndex];
	//     if (selectedTab.type == "library") {
	//         citationBoxParent = document.getElementById('zotero-item-pane-content')
	//     }
	//     else if (selectedTab.type == "reader") {
	//         citationBoxParent = document.getElementById(`${selectedTab.id}-context`)
	//     }

	//     var pane = document.querySelector('#zotero-item-pane');
	//     var header = citationBoxParent.querySelector('.citations-box-header');
	//     var list = citationBoxParent.querySelector('.citations-box-list') as HTMLUListElement;
	//     var footer = citationBoxParent.querySelector('.citations-box-footer');
	//     if (pane && header && list && footer) {
	//         let height =
	//             pane.getBoundingClientRect().height -
	//             header.getBoundingClientRect().height -
	//             footer.getBoundingClientRect().height -
	//             50; // a little padding
	//         list.style.height = height + 'px';
	//     }
	// },

	// /******************************************/
	// // Item menu functions
	// /******************************************/
	// // Create XUL for Zotero menu elements
	zoteroPopup(menuName: MenuSelectionType, doc: Document) {
		const ns =
			"http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
		var zoteroMenu = doc.getElementById(`zotero-${menuName}menu`);
		if (zoteroMenu === null) {
			// Don't do anything if elements not loaded yet
			return;
		}

		var wikiciteSeparator = doc.createElementNS(ns, "menuseparator");
		var wikiciteSeparatorID = `wikicite-${menuName}submenu-separator`;
		wikiciteSeparator.setAttribute("id", wikiciteSeparatorID);
		zoteroMenu.appendChild(wikiciteSeparator);
		WikiciteChrome.registerXUL(wikiciteSeparatorID, doc);

		// Wikicite submenu
		var wikiciteSubmenu = doc.createElementNS(ns, "menu");
		var wikiciteSubmenuID = `wikicite-${menuName}submenu`;
		wikiciteSubmenu.setAttribute("id", wikiciteSubmenuID);
		wikiciteSubmenu.setAttribute(
			"label",
			Wikicite.getString(`wikicite.submenu.label`),
		);
		zoteroMenu.appendChild(wikiciteSubmenu);
		WikiciteChrome.registerXUL(wikiciteSubmenuID, doc);

		// Wikicite submenu popup
		var wikiciteSubmenuPopup = doc.createElementNS(ns, "menupopup");
		wikiciteSubmenuPopup.setAttribute(
			"id",
			`wikicite-${menuName}submenu-popup`,
		);
		wikiciteSubmenu.appendChild(wikiciteSubmenuPopup);

		this.createMenuItems(
			menuName,
			wikiciteSubmenuPopup,
			`wikicite-${menuName}submenu-`,
			false,
			doc,
		);

		this.refreshZoteroPopup(menuName, doc);
	}

	refreshZoteroPopup(menuName: MenuSelectionType, doc: Document) {
		let showSubmenu = true;

		if (menuName === "collection") {
			// Show collection submenu for collections and libraries only
			const collectionTreeRow = ZoteroPane.getCollectionTreeRow();
			if (
				collectionTreeRow &&
				!collectionTreeRow.isCollection() &&
				!collectionTreeRow.isLibrary() &&
				!collectionTreeRow.isGroup()
			) {
				showSubmenu = false;
			}
		}

		if (menuName === "item") {
			const items = ZoteroPane.getSelectedItems();
			// Show item submenu for regular items only
			if (!items.some((item) => item.isRegularItem())) {
				showSubmenu = false;
			}
			// Disable "Show local citation network" if only one item is selected
			if (items.length > 1) {
				// For some reason it only works with setAttribute()
				doc.getElementById(
					"wikicite-itemsubmenu-localCitationNetwork",
				)!.setAttribute("disabled", "false");
			} else {
				doc.getElementById(
					"wikicite-itemsubmenu-localCitationNetwork",
				)!.setAttribute("disabled", "true");
			}
		}

		(
			doc.getElementById(
				`wikicite-${menuName}submenu-separator`,
			)! as HTMLElement
		).hidden = !showSubmenu;
		(
			doc.getElementById(`wikicite-${menuName}submenu`)! as HTMLElement
		).hidden = !showSubmenu;
	}

	// Create Zotero item menu items as children of menuPopup
	createMenuItems(
		menuName: MenuSelectionType,
		menuPopup: Element,
		IDPrefix: string,
		elementsAreRoot: boolean,
		doc: Document,
	) {
		const menuFunctions: Map<
			MenuFunction,
			(menuName: MenuSelectionType) => void
		> = new Map([
			["fetchQIDs", () => this.fetchQIDs(menuName)],
			["syncWithWikidata", () => this.syncWithWikidata(menuName)],
			["getFromCrossref", () => this.getFromCrossref(menuName)],
			["getFromOCC", () => this.getFromOCC(menuName)],
			["getFromAttachments", () => this.getFromAttachments(menuName)],
			["addAsCitations", () => this.addAsCitations(menuName)],
			["localCitationNetwork", () => this.localCitationNetwork(menuName)],
		]);
		for (const [functionName, func] of menuFunctions) {
			if (
				menuName === "collection" &&
				functionName === "addAsCitations"
			) {
				// Fixme: find better way to decide what actions belong to which menu
				// Also consider merging zotero-item, zotero-collection, and wikicite-item
				// menus
				continue;
			}
			const menuFunc = this.zoteroMenuItem(
				menuName,
				functionName,
				func,
				IDPrefix,
				doc,
			);
			menuPopup.appendChild(menuFunc);
			if (elementsAreRoot) {
				WikiciteChrome.registerXUL(menuFunc.id, doc);
			}
		}
	}

	// Create Zotero item menu item
	zoteroMenuItem(
		menuName: MenuSelectionType,
		functionName: MenuFunction,
		func: (menuName: MenuSelectionType) => void,
		IDPrefix: string,
		doc: Document,
	) {
		const ns =
			"http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
		var menuFunc = doc.createElementNS(ns, "menuitem");
		menuFunc.setAttribute("id", IDPrefix + functionName);
		menuFunc.setAttribute(
			"label",
			Wikicite.getString(`wikicite.submenu.${functionName}`),
		);
		menuFunc.addEventListener(
			"command",
			(event) => {
				event.stopPropagation();
				func(menuName);
			},
			false,
		);
		return menuFunc;
	}
}

export default ZoteroOverlay;
