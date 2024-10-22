import Wikicite, { debug } from "./wikicite";
import Citations from "./citations";
import CitationsBoxContainer from "../containers/citationsBoxContainer";
import Crossref from "./crossref";
import Semantic from "./semantic";
import OpenAlex from "./openalex";
import Extraction from "./extract";
import LCN from "./localCitationNetwork";
import OCI from "../oci";
import OpenCitations from "./opencitations";
import * as React from "react";
import SourceItemWrapper from "./sourceItemWrapper";
import WikiciteChrome from "./wikiciteChrome";
import Wikidata from "./wikidata";
import { config } from "../../package.json";
import ItemWrapper from "./itemWrapper";
import * as prefs from "./preferences";
import { Root, createRoot } from "react-dom/client";

import { initLocale, getLocaleID } from "../utils/locale";
import { getPrefGlobalName } from "../utils/prefs";
import { MenuitemOptions } from "zotero-plugin-toolkit/dist/managers/menu";
import Citation from "./citation";
import PID from "./PID";

const TRANSLATORS_PATH = `chrome://${config.addonRef}/content/translators`;
const TRANSLATOR_LABELS = [
	"Wikidata API",
	"Wikidata JSON",
	"OpenAlex JSON",
	"zotkat/Wikidata QuickStatements",
];

const ITEM_PANE_COLUMN_IDS = {
	QID: "qid",
	CITATIONS: "citations",
};

declare type MenuFunction =
	| "fetchQIDs"
	| "syncWithWikidata"
	| "getFromIndexer.Crossref"
	| "getFromIndexer.Semantic Scholar"
	| "getFromIndexer.OpenAlex"
	| "getFromIndexer.OpenCitations"
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
		prefs.initialiseSemanticAPIKey();
		prefs.initialiseLineCount();
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
						)?.id || ""
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

	async getFromCrossref(menuName: MenuSelectionType) {
		// get items selected
		// filter items with doi
		// generate batch call to crossref
		// only add items not available locally yet
		const items = await this.getSelectedItems(menuName, true);
		if (items.length) {
			new Crossref().addCitationsToItems(items);
		}
	}

	async getFromSemantic(menuName: MenuSelectionType) {
		// get items selected
		// filter items with doi
		// generate batch call to crossref
		// only add items not available locally yet
		const items = await this.getSelectedItems(menuName, true);
		if (items.length) {
			new Semantic().addCitationsToItems(items);
		}
	}

	async getFromOpenAlex(menuName: MenuSelectionType) {
		// get items selected
		// filter items with doi
		// generate batch call to crossref
		// only add items not available locally yet
		const items = await this.getSelectedItems(menuName, true);
		if (items.length) {
			new OpenAlex().addCitationsToItems(items);
		}
	}

	async getFromOpenCitations(menuName: MenuSelectionType) {
		// get items selected
		// filter items with doi
		// generate batch call to crossref
		// only add items not available locally yet
		const items = await this.getSelectedItems(menuName, true);
		if (items.length) {
			new OpenCitations().addCitationsToItems(items);
		}
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

	async selectZoteroItems(libraryID: number): Promise<Zotero.Item[]> {
		// Open Zotero item selection dialog
		const io: {
			dataIn: null;
			dataOut: string[] | number[] | null;
			deferred: _ZoteroTypes.DeferredPromise<void>;
			itemTreeID: string;
			filterLibraryIDs: number[];
		} = {
			dataIn: null,
			dataOut: null,
			deferred: Zotero.Promise.defer(),
			itemTreeID: "related-box-select-item-dialog",
			filterLibraryIDs: [libraryID],
		};
		window.openDialog(
			"chrome://zotero/content/selectItemsDialog.xhtml",
			"",
			"chrome,dialog=no,centerscreen,resizable=yes",
			io,
		);

		await io.deferred.promise;
		if (!io.dataOut || !io.dataOut.length) {
			return [];
		}

		const selectedItems = await Zotero.Items.getAsync(io.dataOut);
		if (!selectedItems.length) {
			return [];
		}
		if (selectedItems[0].libraryID != libraryID) {
			Services.prompt.alert(
				window as mozIDOMWindowProxy,
				"",
				Wikicite.getString("wikicite.citation.link.error.library"),
			);
			return [];
		}

		return selectedItems;
	}

	addTargetsToSources(
		targets: SourceItemWrapper[],
		sources: SourceItemWrapper[],
	) {
		for (const source of sources) {
			const citations = targets.map((target) => {
				const citation = new Citation(
					{ item: target.item, ocis: [] },
					source,
				);
				citation.linkToZoteroItem(target.item);
				return citation;
			});
			source.addCitations(citations);
		}
	}

	async addAsCitations(menuName: MenuSelectionType) {
		// Add items selected as citation target items of one or more source items
		// 1. open selectItemsDialog.xul; allow one or more item selection
		// 2. create citation objects for each of the target items selected
		// 3. for each of the source items selected, wrap it into a SourceItemWrapper
		// 4. run addCitations and pass it the citation objects created above
		// 5. finally, link citations to the Zotero items
		const targetItems = await this.getSelectedItems(menuName, true);
		const libraryID = targetItems[0].item.libraryID;
		const selectedItems = await this.selectZoteroItems(libraryID);
		const sources = selectedItems.map(
			(item) => new SourceItemWrapper(item, prefs.getStorage()),
		);
		this.addTargetsToSources(targetItems, sources);
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
		Zotero.PreferencePanes.register(prefOptions);

		// add wikicite submenu to item and collection menus
		this.zoteroPopup("item", doc);
		this.zoteroPopup("collection", doc);

		// Add popup menus to main window
		const mainWindow = doc.getElementById("main-window");
		this.itemAddMenu(doc, mainWindow!);
		this.itemImportMenu(doc, mainWindow!);
		this.itemExportMenu(doc, mainWindow!);
		this.itemMoreMenu(doc, mainWindow!);
		this.citationPopupMenu(doc, mainWindow!);
		this.pidRowPopupMenu(doc, mainWindow!);

		// Add Citations tab to item pane
		this.citationsPane();

		this.addOverlayStyleSheet();
	}

	removeOverlay() {
		this.removeOverlayStyleSheet();
	}

	addOverlayStyleSheet() {
		// todo: it should be possible to just import this and have esbuild work it out
		// FIXME: the stylesheets are re-added each time the plugin is reloaded
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
	async citationsPane() {
		// todo: remove when unloading
		const citationBoxRoots: {
			[id: string]: Root;
		} = {};
		const sectionAddMenu = document.getElementById(
			"citations-box-item-menu-add",
		);
		const sectionImportMenu = document.getElementById(
			"citations-box-item-menu-import",
		);
		const sectionExportMenu = document.getElementById(
			"citations-box-item-menu-export",
		);
		const sectionMoreMenu = document.getElementById(
			"citations-box-item-menu-more",
		);
		Zotero.ItemPaneManager.registerSection({
			paneID: "zotero-editpane-citations-tab",
			pluginID: config.addonID,
			header: {
				l10nID: getLocaleID("wikicite_citations-pane_label"),
				icon: `chrome://${config.addonRef}/content/skin/default/cita-small.svg`,
			},
			sidenav: {
				l10nID: getLocaleID("wikicite_citations-pane_tooltiptext"),
				icon: `chrome://${config.addonRef}/content/skin/default/cita-small.svg`,
			},
			bodyXHTML: `<html:div id="citations-box-container" xmlns:html="http://www.w3.org/1999/xhtml"></html:div>`,
			sectionButtons: [
				{
					type: "add",
					l10nID: "section-button-add",
					icon: "chrome://zotero/skin/16/universal/plus.svg",
					onClick: (props) => {
						(sectionAddMenu as any).openPopup(
							(props.event as any).detail.button,
							"after_end",
						);
					},
				},
				{
					type: "import",
					l10nID: getLocaleID(
						"wikicite_citations-pane_import-button_tooltiptext",
					),
					icon: `chrome://${config.addonRef}/content/skin/default/import.svg`,
					onClick: (props) => {
						(sectionImportMenu as any).openPopup(
							(props.event as any).detail.button,
							"after_end",
						);
					},
				},
				{
					type: "export",
					l10nID: getLocaleID(
						"wikicite_citations-pane_export-button_tooltiptext",
					),
					icon: "chrome://zotero/skin/16/universal/export.svg",
					onClick: (props) => {
						(sectionExportMenu as any).openPopup(
							(props.event as any).detail.button,
							"after_end",
						);
					},
				},
				{
					type: "options",
					l10nID: "itembox-button-options",
					icon: "chrome://zotero/skin/16/universal/options.svg",
					onClick: (props) => {
						(sectionMoreMenu as any).openPopup(
							(props.event as any).detail.button,
							"after_end",
						);
					},
				},
			],
			onInit: ({ body, refresh }) => {
				// We get a react error if we try to create a root on the same HTML Element more than once
				// so we need to keep track of each separate item pane's root so we can re-render it when the item changes
				// we do this because each tab (library and every reader) has a unique tab_id that we can get by walking
				// up the DOM from the body
				const tab_id: string =
					body.parentElement!.parentElement!.parentElement!
						.parentElement!.parentElement!.parentElement!.id;
				citationBoxRoots[tab_id] = createRoot(
					body.firstChild! as Element,
				);
			},
			onRender: ({ body, item, setSectionButtonStatus, setL10nArgs }) => {
				// Use Fluent for localization
				// As mentioned in https://groups.google.com/g/zotero-dev/c/wirqnj_EQUQ/m/ud3k0SpMAAAJ
				// As seen in https://github.com/zotero/make-it-red/blob/5a7ee1be2f147a327220c1e5a4129d6c6169999c/src-2.0/make-it-red.js#L33
				window.MozXULElement.insertFTLIfNeeded(
					`${config.addonRef}-addon.ftl`,
				);

				if (!item.isRegularItem()) {
					return;
				}
				const tab_id: string =
					body.parentElement!.parentElement!.parentElement!
						.parentElement!.parentElement!.parentElement!.id;
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

				const citationCount = new SourceItemWrapper(
					item,
					prefs.getStorage(),
				).citations.length;

				if (!item.isEditable()) {
					setSectionButtonStatus("add", {
						disabled: true,
						hidden: true,
					});
					setSectionButtonStatus("import", {
						disabled: true,
						hidden: true,
					});
				}

				// TODO: find the right hook so that the header updates when citations change
				setL10nArgs(`{"citationCount": "${citationCount}"}`);
			},
			onItemChange: ({ item, setEnabled }) => {
				setEnabled(item.isRegularItem());
			},
		});
	}

	/**
	 * Opens the citation editor window.
	 * @param {Citation} citation - Citation to be edited.
	 * @returns {Zotero.Item} - Edited cited item.
	 */
	openEditor(citation: Citation): Zotero.Item | undefined {
		const args = {
			citation: citation,
			addon: addon,
			ZoteroPane: ZoteroPane,
			goUpdateGlobalEditMenuItems:
				window.document.defaultView!.goUpdateGlobalEditMenuItems,
		};
		const retVals: { [key: string]: any } = {};
		window.openDialog(
			`chrome://${config.addonRef}/content/citationEditor.xhtml`,
			"",
			"chrome,dialog=no,modal,centerscreen,resizable,width=380,height=500",
			args,
			retVals,
		);
		return retVals.item;
	}

	handleCitationAdd() {
		if (!this._sourceItem) return;

		const citation = new Citation(
			{
				item: {
					itemType: "journalArticle", // Fixme: maybe replace with a const
				},
				ocis: [],
			},
			this._sourceItem,
		);
		const item = this.openEditor(citation);
		if (!item) {
			debug("Edit cancelled by user.");
			return;
		}
		if (
			this._sourceItem.getPID("QID") &&
			Wikicite.getExtraField(item, "QID").values[0]
		) {
			debug(
				"Source and target items have QIDs! Offer syncing to Wikidata.",
			);
		}
		citation.target.item = item;

		// Make sure the component updates even before changes are saved to the item
		// setCitations(
		//   // sourceItem.citations  // this doesn't work because sourceItem.citation object's reference hasn't changed
		//   // () => sourceItem.citations  // works only one time per render - possibly because the function itself doesn't change
		//   [...sourceItem.citations]  // works
		// );
		// Problem is if I do this [...citations], the citations passed down to CitationsBox
		// are not the citations of the CitationsList here. Therefore, if I implement methods
		// in the Citation class to modify themselves, they won't work.

		// This will save changes to the item's extra field
		// The modified item observer above will be triggered.
		// This will update the sourceItem ref, and the component's state.
		this._sourceItem.addCitations(citation);
		// props.sourceItem.save();
		// Unexpectedly, this also triggers the zotero-items-tree `select` event
		// which in turn runs zoteroOverlay's refreshCitationsPaneMethod.
		// However, as props.item will not have changed, component will not update.
	}

	// FIXME: for all popups, eventListeners don't seem to work after extension reload
	/** Item-wide popup menu to add new citations */
	itemAddMenu(doc: Document, mainWindow: Element) {
		const itemMenu = WikiciteChrome.createXULMenuPopup(
			doc,
			"citations-box-item-menu-add",
			{},
			{
				popupshowing: () => this.handleItemPopupShowing(doc),
			},
			[
				// Add existing Zotero item menu item
				{
					attributes: {
						id: "item-menu-add-zotero",
						label: Wikicite.getString(
							"wikicite.item-menu.add-zotero",
						),
					},
					listeners: {
						command: async () => {
							const selectedItems = await this.selectZoteroItems(
								this._sourceItem!.item.libraryID,
							);
							const targets = selectedItems.map(
								(item) =>
									new SourceItemWrapper(
										item,
										prefs.getStorage(),
									),
							);
							this.addTargetsToSources(targets, [
								this._sourceItem!,
							]);
						},
					},
				},
				// Add citations by identifier menu item
				{
					attributes: {
						id: "item-menu-identifier-import",
						label: Wikicite.getString(
							"wikicite.item-menu.import-identifier",
						),
					},
					listeners: {
						command: () =>
							this._sourceItem!.addCitationsByIdentifier(),
					},
				},
				// Add item manually menu item
				{
					attributes: {
						id: "item-menu-add-manually",
						label: Wikicite.getString(
							"wikicite.item-menu.add-manually",
						),
					},
					listeners: {
						command: () => this.handleCitationAdd(),
					},
				},
			],
		);

		mainWindow.appendChild(itemMenu);
	}

	/** Item-wide popup menu for importing citations */
	itemImportMenu(doc: Document, mainWindow: Element) {
		const itemMenu = WikiciteChrome.createXULMenuPopup(
			doc,
			"citations-box-item-menu-import",
			{},
			{
				popupshowing: () => this.handleItemPopupShowing(doc),
			},
			[
				// Get Crossref citations menu item
				{
					attributes: {
						id: "item-menu-crossref-get",
						label: Wikicite.formatString(
							"wikicite.item-menu.get-indexer",
							"Crossref",
						),
					},
					listeners: {
						command: () => this._sourceItem!.getFromCrossref(),
					},
				},
				// Get Semantic citations menu item
				{
					attributes: {
						id: "item-menu-semantic-get",
						label: Wikicite.formatString(
							"wikicite.item-menu.get-indexer",
							"Semantic Scholar",
						),
					},
					listeners: {
						command: () => this._sourceItem!.getFromSemantic(),
					},
				},
				// Get OpenAlex citations menu item
				{
					attributes: {
						id: "item-menu-openalex-get",
						label: Wikicite.formatString(
							"wikicite.item-menu.get-indexer",
							"OpenAlex",
						),
					},
					listeners: {
						command: () => this._sourceItem!.getFromOpenAlex(),
					},
				},
				// Get OpenCitations citations menu item
				{
					attributes: {
						id: "item-menu-opencitations-get",
						label: Wikicite.formatString(
							"wikicite.item-menu.get-indexer",
							"OpenCitations",
						),
					},
					listeners: {
						command: () => this._sourceItem!.getFromOpenCitations(),
					},
				},
				// Get OpenCitations citations menu item
				{
					attributes: {
						id: "item-menu-pdf-extract",
						label: Wikicite.getString("wikicite.item-menu.get-pdf"),
					},
					listeners: {
						command: () => this._sourceItem!.getFromPDF(),
					},
				},
				// Import citations menu item
				{
					attributes: {
						id: "item-menu-citations-import",
						label: Wikicite.getString(
							"wikicite.item-menu.import-citations",
						),
					},
					listeners: {
						command: () => this._sourceItem!.importCitations(),
					},
				},
			],
		);

		mainWindow.appendChild(itemMenu);
	}

	/** Item-wide popup menu for exporting citations */
	itemExportMenu(doc: Document, mainWindow: Element) {
		const itemMenu = WikiciteChrome.createXULMenuPopup(
			doc,
			"citations-box-item-menu-export",
			{},
			{
				popupshowing: () => this.handleItemPopupShowing(doc),
			},
			[
				// Export to file menu item
				{
					attributes: {
						id: "item-menu-file-export",
						label: Wikicite.getString(
							"wikicite.item-menu.export-file",
						),
					},
					listeners: {
						command: () => this._sourceItem!.exportToFile(),
					},
				},
				// Export to CROCI menu item
				{
					attributes: {
						id: "item-menu-croci-export",
						label: Wikicite.getString(
							"wikicite.item-menu.export-croci",
						),
					},
					listeners: {
						command: () => this._sourceItem!.exportToCroci(),
					},
				},
			],
		);

		mainWindow.appendChild(itemMenu);
	}

	/** Item-wide popup menu for extra functions */
	itemMoreMenu(doc: Document, mainWindow: Element) {
		const itemMenu = WikiciteChrome.createXULMenuPopup(
			doc,
			"citations-box-item-menu-more",
			{},
			{
				popupshowing: () => this.handleItemPopupShowing(doc),
			},
			[
				// Sync with Wikidata menu item
				{
					attributes: {
						id: "item-menu-wikidata-sync",
						label: Wikicite.getString(
							"wikicite.item-menu.sync-wikidata",
						),
					},
					listeners: {
						command: () => this._sourceItem!.syncWithWikidata(),
					},
				},
				// Fetch QIDs menu item
				{
					attributes: {
						id: "item-menu-fetch-citation-qids",
						label: Wikicite.getString(
							"wikicite.item-menu.fetch-citation-qids",
						),
					},
					listeners: {
						command: () => this._sourceItem!.fetchCitationQIDs(),
					},
				},
				// Auto-link citations menu item
				{
					attributes: {
						id: "item-menu-autolink-citations",
						label: Wikicite.getString(
							"wikicite.item-menu.autolink-citations",
						),
					},
					listeners: {
						command: () => this._sourceItem!.autoLinkCitations(),
					},
				},
			],
		);

		// Sort-by submenu

		const menuSort = doc.createXULElement("menu");
		menuSort.setAttribute("id", "item-menu-sort-submenu");
		menuSort.setAttribute(
			"label",
			Wikicite.getString("wikicite.item-menu.sort"),
		);

		const sortPopup = doc.createXULElement("menupopup");
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
			const itemSort = doc.createXULElement("menuitem");
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

		itemMenu.insertBefore(menuSort, itemMenu.children[2]);
		mainWindow.appendChild(itemMenu);
	}

	/** Citation-specific popup menu */
	citationPopupMenu(doc: Document, mainWindow: Element) {
		const citationMenu = WikiciteChrome.createXULMenuPopup(
			doc,
			"citations-box-citation-menu",
			{},
			{
				popupshowing: () => this.handleCitationPopupShowing(doc),
			},
			[
				// Sync citations with Wikidata
				{
					attributes: {
						id: "citation-menu-wikidata-sync",
						label: Wikicite.getString(
							"wikicite.citation-menu.sync-wikidata",
						),
					},
					listeners: {
						command: () =>
							this._sourceItem!.syncWithWikidata(
								this._citationIndex,
							),
					},
				},
				// Fetch QIDs for citations
				{
					attributes: {
						id: "citation-menu-fetch-qid",
						label: Wikicite.getString(
							"wikicite.citation-menu.fetch-qid",
						),
					},
					listeners: {
						command: () =>
							this._sourceItem!.fetchCitationQIDs(
								this._citationIndex,
							),
					},
				},
				// Export to file
				{
					attributes: {
						id: "citation-menu-file-export",
						label: Wikicite.getString(
							"wikicite.citation-menu.export-file",
						),
					},
					listeners: {
						command: () =>
							this._sourceItem!.exportToFile(this._citationIndex),
					},
				},
				// Export to Croci
				{
					attributes: {
						id: "citation-menu-croci-export",
						label: Wikicite.getString(
							"wikicite.citation-menu.export-croci",
						),
					},
					listeners: {
						command: () =>
							this._sourceItem!.exportToCroci(
								this._citationIndex,
							),
					},
				},
			],
		);

		// Fixme: but OCI has two more suppliers: Dryad and CROCI
		// Maybe I should have all of them, and show only the available ones
		// for any one citation?
		const ociMenu = doc.createXULElement("menu");
		ociMenu.setAttribute("id", "citation-menu-oci-submenu");
		ociMenu.setAttribute(
			"label",
			Wikicite.getString("wikicite.citation-menu.oci"),
		);

		const ociPopup = doc.createXULElement("menupopup");
		ociPopup.setAttribute("id", "citation-menu-oci-submenu-popup");
		ociMenu.appendChild(ociPopup);

		for (const supplier of ["crossref", "occ", "wikidata"]) {
			const ociItem = doc.createXULElement("menuitem");
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
		citationMenu.appendChild(ociMenu);

		mainWindow.appendChild(citationMenu);
	}

	/** Popup meu for adding new PID rows */
	pidRowPopupMenu(doc: Document, mainWindow: Element) {
		const pidRowMenu = WikiciteChrome.createXULMenuPopup(
			doc,
			"pid-row-add-menu",
			{},
			{
				popupshowing: () => this.handlePidRowPopupShowing(doc),
			},
			PID.showable.map((pidType) => {
				return {
					attributes: {
						id: `pid-row-add-${pidType}`,
						label: pidType,
					},
					listeners: {
						command: (event: Event) => {
							event.preventDefault();
							document
								.getElementById(`pid-row-${pidType}`)!
								.classList.remove("hidden");
							(
								document.getElementById(
									`pid-row-add-${pidType}`,
								) as XUL.MenuItem
							).style.display = "none";
							if (
								Array.from(
									document.getElementById("pid-row-add-menu")!
										.children!,
								).every(
									(menuItem) =>
										(menuItem as XUL.MenuItem).style
											.display == "none",
								)
							) {
								(
									document.getElementById(
										"pid-row-add-btn",
									) as HTMLDivElement
								).hidden = true;
							}
						},
					},
				};
			}),
		);

		mainWindow.appendChild(pidRowMenu);
	}

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
		const sourceQid = sourceItem!.qid;

		const itemWikidataSync = document.getElementById(
			"item-menu-wikidata-sync",
		) as XUL.MenuItem;
		const itemFetchCitationQIDs = document.getElementById(
			"item-menu-fetch-citation-qids",
		) as XUL.MenuItem;
		const itemCrossrefGet = document.getElementById(
			"item-menu-crossref-get",
		) as XUL.MenuItem;
		const itemSemanticGet = document.getElementById(
			"item-menu-semantic-get",
		) as XUL.MenuItem;
		const itemOpenAlexGet = document.getElementById(
			"item-menu-openalex-get",
		) as XUL.MenuItem;
		const itemOpenCitationsGet = document.getElementById(
			"item-menu-opencitations-get",
		) as XUL.MenuItem;
		const itemPdfExtract = document.getElementById(
			"item-menu-pdf-extract",
		) as XUL.MenuItem;
		const itemIdentifierImport = document.getElementById(
			"item-menu-identifier-import",
		) as XUL.MenuItem;
		const itemCitationsImport = document.getElementById(
			"item-menu-citations-import",
		) as XUL.MenuItem;
		const itemFileExport = document.getElementById(
			"item-menu-file-export",
		) as XUL.MenuItem;
		const itemCrociExport = document.getElementById(
			"item-menu-croci-export",
		) as XUL.MenuItem;

		itemWikidataSync.disabled = !sourceQid;
		itemFetchCitationQIDs.disabled = !hasCitations;

		// Indexers
		itemCrossrefGet.disabled = !sourceDoi;
		itemSemanticGet.disabled = !new Semantic().canFetchCitations(
			sourceItem!,
		);
		itemOpenAlexGet.disabled = !new OpenAlex().canFetchCitations(
			sourceItem!,
		);
		itemOpenCitationsGet.disabled = !new OpenCitations().canFetchCitations(
			sourceItem!,
		);

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
			doc.getElementById("citation-menu-wikidata-sync") as XUL.MenuItem
		).disabled = !sourceItem?.qid || !targetItem?.qid;
		(
			doc.getElementById("citation-menu-fetch-qid") as XUL.MenuItem
		).disabled = false;
		(
			doc.getElementById("citation-menu-file-export") as XUL.MenuItem
		).disabled = false;
		(
			doc.getElementById("citation-menu-croci-export") as XUL.MenuItem
		).disabled = !sourceItem?.doi || !targetItem?.doi;
		(
			doc.getElementById("citation-menu-oci-crossref") as XUL.MenuItem
		).disabled = !ociSuppliers?.includes("crossref");
		(doc.getElementById("citation-menu-oci-occ") as XUL.MenuItem).disabled =
			!ociSuppliers?.includes("occ");
		(
			doc.getElementById("citation-menu-oci-wikidata") as XUL.MenuItem
		).disabled = !ociSuppliers?.includes("wikidata");
	}

	handlePidRowPopupShowing(doc: Document) {
		const sourceItem = this._sourceItem!;
		const sourceItemPIDTypes = sourceItem.validPIDTypes;

		PID.showable.forEach((pidType) => {
			// if item supports PID, but it is currently hidden, show menu item to add it
			(
				doc.getElementById(`pid-row-add-${pidType}`) as XUL.MenuItem
			).hidden = !(
				sourceItemPIDTypes.includes(pidType) &&
				document
					.getElementById(`pid-row-${pidType}`)
					?.classList.contains("hidden")
			);
		});
	}

	// /******************************************/
	// // Item menu functions
	// /******************************************/
	/** Create XUL for Zotero menu elements */
	zoteroPopup(menuName: MenuSelectionType, doc: Document) {
		// Wikicite submenu
		ztoolkit.Menu.register(menuName, {
			tag: "menuseparator",
			id: `wikicite-${menuName}submenu-separator`,
		});

		const menuItems = this.createMenuItems(
			menuName,
			`wikicite-${menuName}submenu-`,
		);

		ztoolkit.Menu.register(menuName, {
			tag: "menu",
			id: `wikicite-${menuName}submenu`,
			label: Wikicite.getString(`wikicite.submenu.label`),
			children: menuItems,
		});

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
			// Enable indexer citation lookup when appropriate identifiers are present
			const enableCrossref = items.some((item) => {
				const sourceItem = new SourceItemWrapper(
					item,
					prefs.getStorage(),
				);
				return sourceItem.doi;
			});
			const enableSemantic = items.some((item) => {
				const sourceItem = new SourceItemWrapper(
					item,
					prefs.getStorage(),
				);
				return new Semantic().canFetchCitations(sourceItem);
			});
			const enableOpenAlex = items.some((item) => {
				const sourceItem = new SourceItemWrapper(
					item,
					prefs.getStorage(),
				);
				return new OpenAlex().canFetchCitations(sourceItem);
			});
			const enableOpenCitations = items.some((item) => {
				const sourceItem = new SourceItemWrapper(
					item,
					prefs.getStorage(),
				);
				return new OpenCitations().canFetchCitations(sourceItem);
			});
			doc.getElementById(
				"wikicite-itemsubmenu-getFromIndexer.Crossref",
			)!.setAttribute("disabled", enableCrossref ? "false" : "true");
			doc.getElementById(
				"wikicite-itemsubmenu-getFromIndexer.Semantic Scholar",
			)!.setAttribute("disabled", enableSemantic ? "false" : "true");
			doc.getElementById(
				"wikicite-itemsubmenu-getFromIndexer.OpenAlex",
			)!.setAttribute("disabled", enableOpenAlex ? "false" : "true");
			doc.getElementById(
				"wikicite-itemsubmenu-getFromIndexer.OpenCitations",
			)!.setAttribute("disabled", enableOpenCitations ? "false" : "true");
		}

		(
			doc.getElementById(
				`wikicite-${menuName}submenu-separator`,
			)! as XUL.MenuSeparator
		).hidden = !showSubmenu;
		(
			doc.getElementById(`wikicite-${menuName}submenu`)! as XUL.Menu
		).hidden = !showSubmenu;
	}

	// Create Zotero item menu items as children of menuPopup
	createMenuItems(
		menuName: MenuSelectionType,
		IDPrefix: string,
	): MenuitemOptions[] {
		const menuFunctions: Map<
			MenuFunction,
			(menuName: MenuSelectionType) => void
		> = new Map([
			["fetchQIDs", () => this.fetchQIDs(menuName)],
			["syncWithWikidata", () => this.syncWithWikidata(menuName)],
			["getFromIndexer.Crossref", () => this.getFromCrossref(menuName)],
			[
				"getFromIndexer.Semantic Scholar",
				() => this.getFromSemantic(menuName),
			],
			["getFromIndexer.OpenAlex", () => this.getFromOpenAlex(menuName)],
			[
				"getFromIndexer.OpenCitations",
				() => this.getFromOpenCitations(menuName),
			],
			["getFromAttachments", () => this.getFromAttachments(menuName)],
			["addAsCitations", () => this.addAsCitations(menuName)],
			["localCitationNetwork", () => this.localCitationNetwork(menuName)],
		]);

		const options: MenuitemOptions[] = [];
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
			);
			options.push(menuFunc);
		}
		return options;
	}

	// Create Zotero item menu item
	zoteroMenuItem(
		menuName: MenuSelectionType,
		functionName: MenuFunction,
		func: (menuName: MenuSelectionType) => void,
		IDPrefix: string,
	) {
		let label: string;
		if (functionName.includes("getFromIndexer.")) {
			const indexerName = functionName.split(".")[1];
			label = Wikicite.formatString(
				"wikicite.submenu.get-from-indexer",
				indexerName,
			);
		} else label = Wikicite.getString(`wikicite.submenu.${functionName}`);
		const menuOptions: MenuitemOptions = {
			tag: "menuitem",
			id: IDPrefix + functionName,
			label: label,
			commandListener: (event) => {
				event.stopPropagation();
				func(menuName);
			},
		};
		return menuOptions;
	}
}

export default ZoteroOverlay;
