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
import { IndexerBase } from "./indexer";
import PIDBoxContainer from "../containers/pidBoxContainer";

const TRANSLATORS_PATH = `chrome://${config.addonRef}/content/translators`;
const TRANSLATOR_LABELS = [
	"Wikidata API",
	"Wikidata JSON",
	// TODO: Remove both OpenAlex translators once merged into zotero/translators
	// See: https://github.com/zotero/translators/pull/3379
	"OpenAlex JSON",
	"OpenAlex",
	"Crossref REST",
];

const ITEM_PANE_COLUMN_IDS = {
	QID: "qid",
	CITATIONS: "citations",
};

declare type MenuFunction =
	| "getIdentifiers.QID"
	| "getIdentifiers.OpenAlex"
	| "getIdentifiers.CorpusID"
	| "syncWithWikidata"
	| "getCitations.Crossref"
	| "getCitations.Semantic Scholar"
	| "getCitations.OpenAlex"
	| "getCitations.OpenCitations"
	| "getFromAttachments"
	| "addAsCitations"
	| "localCitationNetwork"
	| "deleteCitations";

declare type MenuSelectionType = "item" | "collection";

class ZoteroOverlay {
	qidColumnID?: string | false;
	numCitationsColumnID?: string | false;
	_sourceItem?: SourceItemWrapper;
	_citationIndex?: number;
	_shownPIDs = new Set<PIDType>();
	pidChangeCallback?: (shownPIDs: Set<PIDType>) => void;
	preferenceUpdateObservers?: symbol[];

	/******************************************/
	// Window load handling
	/******************************************/
	constructor(win: Window) {
		this.setDefaultPreferences();

		this.fullOverlay();

		this.addItemPaneColumns();

		this.addPreferenceUpdateObservers();

		// refresh item and collection submenus each time they show
		window.document
			.getElementById("zotero-itemmenu")
			?.addEventListener(
				"popupshowing",
				(event) => this.refreshZoteroPopup("item", window.document),
				false,
			);
		window.document
			.getElementById("zotero-collectionmenu")
			?.addEventListener(
				"popupshowing",
				(event) =>
					this.refreshZoteroPopup("collection", window.document),
				false,
			);

		this.installTranslators();
	}

	unload() {
		this.removeOverlay();

		this.removeItemPaneColumns();

		this.removePreferenceUpdateObservers();

		this.uninstallTranslators();
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

	async getPIDsFromIndexer<Ref>(
		menuName: MenuSelectionType,
		IndexerType: new () => IndexerBase<Ref>,
	) {
		const items = await this.getSelectedItems(menuName, true);
		if (items.length) {
			const indexer = new IndexerType();
			indexer.fetchMultiplePIDs(items);
		}
	}

	async getCitationsFromIndexer<Ref>(
		menuName: MenuSelectionType,
		IndexerType: new () => IndexerBase<Ref>,
	) {
		const items = await this.getSelectedItems(menuName, true);
		if (items.length) {
			const indexer = new IndexerType();
			indexer.addCitationsToItems(items);
		}
	}

	async deleteCitations(menuName: MenuSelectionType) {
		const items = await this.getSelectedItems(menuName, true);
		if (items.length) {
			const totalCitationsCount =
				menuName === "item"
					? items.reduce(
							(acc, item) => acc + item.citations.length,
							0,
						)
					: null;
			const confirmed = Services.prompt.confirm(
				window as mozIDOMWindowProxy,
				Wikicite.getString(
					"wikicite.source-item.delete-citations.confirm.title",
				),
				Wikicite.formatString(
					"wikicite.source-item.delete-citations.confirm.message",
					totalCitationsCount ?? "All",
				),
			);
			if (!confirmed) return;
			items.forEach((item) => item.deleteCitations());
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
		this.pidPane();

		this.addOverlayStyleSheet();
	}

	removeOverlay() {
		this.removeOverlayStyleSheet();

		// Unmount React roots
		for (const rootID in this.citationBoxRoots) {
			this.citationBoxRoots[rootID].unmount();
			window.document.getElementById(rootID)?.remove();
		}
		for (const rootID in this.pidBoxRoots) {
			this.pidBoxRoots[rootID].unmount();
			window.document.getElementById(rootID)?.remove();
		}
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

	citationBoxRoots: {
		[id: string]: Root;
	} = {};

	pidBoxRoots: {
		[id: string]: Root;
	} = {};

	/******************************************/
	// Item pane functions
	/******************************************/
	// Create XUL for Zotero item pane
	async citationsPane() {
		const sectionAddMenu = document.getElementById(
			"citations-box-item-menu-add",
		) as unknown as XULMenuPopupElement;
		const sectionImportMenu = document.getElementById(
			"citations-box-item-menu-import",
		) as unknown as XULMenuPopupElement;
		const sectionExportMenu = document.getElementById(
			"citations-box-item-menu-export",
		) as unknown as XULMenuPopupElement;
		const sectionMoreMenu = document.getElementById(
			"citations-box-item-menu-more",
		) as unknown as XULMenuPopupElement;
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
						sectionAddMenu.openPopup(
							(props.event as CustomEvent).detail.button,
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
						sectionImportMenu.openPopup(
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
						sectionExportMenu.openPopup(
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
						sectionMoreMenu.openPopup(
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
				this.citationBoxRoots[tab_id] = createRoot(
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
				this.citationBoxRoots[tab_id].render(
					<CitationsBoxContainer
						key={"citationsBox-" + item.id}
						item={item}
						onCountChange={(newCount: number) => {
							setL10nArgs(`{"citationCount": "${newCount}"}`);
						}}
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

				setL10nArgs(`{"citationCount": "${citationCount}"}`);
			},
			onItemChange: ({ item, setEnabled }) => {
				this.setSourceItem(
					new SourceItemWrapper(item, prefs.getStorage()),
				);
				setEnabled(item.isRegularItem());
			},
		});
	}

	async pidPane() {
		const pidAddMenu = document.getElementById(
			"pid-row-add-menu",
		) as unknown as XULMenuPopupElement;

		Zotero.ItemPaneManager.registerSection({
			paneID: "zotero-editpane-pid-tab",
			pluginID: config.addonID,
			header: {
				l10nID: getLocaleID("wikicite_pid-pane_label"),
				icon: `chrome://${config.addonRef}/content/skin/default/pid-small.svg`,
			},
			sidenav: {
				l10nID: getLocaleID("wikicite_pid-pane_tooltiptext"),
				icon: `chrome://${config.addonRef}/content/skin/default/pid-small.svg`,
			},
			bodyXHTML: `<html:div id="pid-box-container" xmlns:html="http://www.w3.org/1999/xhtml"></html:div>`,
			sectionButtons: [
				{
					type: "add-pid",
					l10nID: "section-button-add",
					icon: "chrome://zotero/skin/16/universal/plus.svg",
					onClick: (props) => {
						pidAddMenu.openPopup(
							(props.event as CustomEvent).detail.button,
							"after_end",
						);
					},
				},
			],
			onInit: ({ body }) => {
				const tab_id: string =
					body.parentElement!.parentElement!.parentElement!
						.parentElement!.parentElement!.parentElement!.id;
				this.pidBoxRoots[tab_id] = createRoot(
					body.firstChild! as Element,
				);
			},
			onRender: ({ body, item, setSectionButtonStatus }) => {
				window.MozXULElement.insertFTLIfNeeded(
					`${config.addonRef}-addon.ftl`,
				);

				if (!item.isRegularItem()) {
					return;
				}
				const tab_id: string =
					body.parentElement!.parentElement!.parentElement!
						.parentElement!.parentElement!.parentElement!.id;
				this.pidBoxRoots[tab_id].render(
					<PIDBoxContainer
						key={"pidBox-" + item.id}
						item={item}
						onNoPIDsLeftToShow={(hidden) => {
							setSectionButtonStatus("add-pid", {
								disabled: hidden,
								hidden: hidden,
							});
						}}
						editable={
							ZoteroPane.collectionsView
								? ZoteroPane.collectionsView.editable
								: true
						}
					/>,
				);
			},
			onItemChange: ({ item, setEnabled }) => {
				// setSourceItem is already called for the citations pane
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
			Wikicite.getExtraField(item, "QID").values.length
		) {
			debug(
				"Source and target items have QIDs! Offer syncing to Wikidata.",
			);
		}
		citation.target.item = item;

		// This will save changes to the item's extra field
		// The modified item observer above will be triggered.
		// This will update the sourceItem ref, and the component's state.
		this._sourceItem.addCitations(citation);
	}

	// FIXME: for all popups, eventListeners don't seem to work after extension reload
	/** Item-wide popup menu to add new citations */
	itemAddMenu(doc: Document, mainWindow: Element) {
		const itemMenu = WikiciteChrome.createXULMenuPopup(
			doc,
			"citations-box-item-menu-add",
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

	private indexerMenuAttributes<Ref>(
		IndexerType: new () => IndexerBase<Ref>,
	) {
		const indexer = new IndexerType();
		return {
			// TODO: set an indexer id attribute
			attributes: {
				id: `item-menu-${indexer.indexerName.toLowerCase().replace(" ", "-")}-get`,
				label: Wikicite.formatString(
					"wikicite.item-menu.get-indexer",
					indexer.indexerName,
				),
			},
			listeners: {
				command: () => this._sourceItem!.getFrom(indexer),
			},
			isDisabled: () => !indexer.canFetchCitations(this._sourceItem!),
		};
	}

	/** Item-wide popup menu for importing citations */
	itemImportMenu(doc: Document, mainWindow: Element) {
		const itemMenu = WikiciteChrome.createXULMenuPopup(
			doc,
			"citations-box-item-menu-import",
			[
				// Get Crossref citations menu item
				this.indexerMenuAttributes(Crossref),
				// Get Semantic citations menu item
				this.indexerMenuAttributes(Semantic),
				// Get OpenAlex citations menu item
				this.indexerMenuAttributes(OpenAlex),
				// Get OpenCitations citations menu item
				this.indexerMenuAttributes(OpenCitations),
				// Extract from PDF menu item
				{
					attributes: {
						id: "item-menu-pdf-extract",
						label: Wikicite.getString("wikicite.item-menu.get-pdf"),
					},
					listeners: {
						command: () => this._sourceItem!.getFromPDF(),
					},
					isDisabled: () =>
						!this._sourceItem!.item.getAttachments().length,
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
					isDisabled: () => !this._sourceItem!.citations.length,
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
					isDisabled: () => !this._sourceItem!.citations.length,
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
					isDisabled: () => !this._sourceItem!.qid,
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
					isDisabled: () => !this._sourceItem!.citations.length,
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
					isDisabled: () => {
						const sourceItem = this._sourceItem;
						const citation =
							sourceItem?.citations[this._citationIndex!];
						const targetItem = citation?.target;
						return !sourceItem?.qid || !targetItem?.qid;
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
					isDisabled: () => {
						const sourceItem = this._sourceItem;
						const citation =
							sourceItem?.citations[this._citationIndex!];
						const targetItem = citation?.target;
						return !sourceItem?.doi || !targetItem?.doi;
					},
				},
			],
		);

		// Blur (unfocus) the button when the menu disappears
		citationMenu.addEventListener("popuphiding", () => {
			// Reset focus after clicking to remove hover effect
			if (
				document.activeElement &&
				typeof (document.activeElement as HTMLElement | XULElement)
					.blur === "function"
			) {
				(document.activeElement as HTMLElement | XULElement).blur();
			}
		});

		// Fixme: but OCI has two more suppliers: Dryad and CROCI
		// Maybe I should have all of them, and show only the available ones
		// for any one citation?
		const ociMenu = doc.createXULElement("menu");
		ociMenu.setAttribute("id", "citation-menu-oci-submenu");
		ociMenu.setAttribute(
			"label",
			Wikicite.getString("wikicite.citation-menu.oci"),
		);

		const ociPopup = doc.createXULElement(
			"menupopup",
		) as XULMenuPopupElement;
		ociPopup.setAttribute("id", "citation-menu-oci-submenu-popup");
		ociMenu.appendChild(ociPopup);

		for (const supplier of ["crossref", "occ", "wikidata"]) {
			const ociItem = doc.createXULElement(
				"menuitem",
			) as XULMenuItemElement;
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
			ociPopup.addEventListener("popupshowing", () => {
				const sourceItem = this._sourceItem;
				const citation = sourceItem?.citations[this._citationIndex!];
				const ociSuppliers = citation?.ocis.map(
					(oci) => oci.supplierName,
				);
				ociItem.disabled = !ociSuppliers?.includes(supplier);
			});
			ociPopup.appendChild(ociItem);
		}
		citationMenu.appendChild(ociMenu);

		mainWindow.appendChild(citationMenu);
	}

	/** Popup menu for adding new PID rows */
	pidRowPopupMenu(doc: Document, mainWindow: Element) {
		const pidRowMenu = WikiciteChrome.createXULMenuPopup(
			doc,
			"pid-row-add-menu",
			[...PID.showable].map((pidType) => {
				return {
					attributes: {
						id: `pid-row-add-${pidType}`,
						label: pidType,
					},
					listeners: {
						command: (event: Event) => {
							event.preventDefault();
							this.showPID(pidType);
						},
					},
					isHidden: () => {
						// If the PID row is already shown or the source item doesn't support it, hide the menu item
						return (
							this._shownPIDs.has(pidType) ||
							!this._sourceItem!.validPIDTypes.has(pidType)
						);
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

	// Used only to sync the state from React to the overlay
	setShownPIDs(pidTypes: Set<PIDType>) {
		this._shownPIDs = pidTypes;
	}

	showPID(pidType: PIDType) {
		this._shownPIDs.add(pidType);
		this.notifyPIDChanges();
	}

	// Method to register a callback for PID changes
	onPIDChange(callback?: (pidTypes: Set<PIDType>) => void) {
		this.pidChangeCallback = callback;
	}

	notifyPIDChanges() {
		if (this.pidChangeCallback) {
			this.pidChangeCallback(this._shownPIDs);
		}
	}

	setCitationIndex(citationIndex: number) {
		this._citationIndex = citationIndex;
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

	private enableIndexer<Ref>(
		IndexerType: new () => IndexerBase<Ref>,
		items: Zotero.Item[],
	): boolean {
		const indexer = new IndexerType();
		return items
			.filter((item) => item.isRegularItem())
			.some((item) => {
				const sourceItem = new SourceItemWrapper(
					item,
					prefs.getStorage(),
				);
				return indexer.canFetchCitations(sourceItem);
			});
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
			doc.getElementById(
				"wikicite-itemsubmenu-getCitations.Crossref",
			)!.setAttribute(
				"disabled",
				this.enableIndexer(Crossref, items) ? "false" : "true",
			);
			doc.getElementById(
				"wikicite-itemsubmenu-getCitations.Semantic Scholar",
			)!.setAttribute(
				"disabled",
				this.enableIndexer(Semantic, items) ? "false" : "true",
			);
			doc.getElementById(
				"wikicite-itemsubmenu-getCitations.OpenAlex",
			)!.setAttribute(
				"disabled",
				this.enableIndexer(OpenAlex, items) ? "false" : "true",
			);
			doc.getElementById(
				"wikicite-itemsubmenu-getCitations.OpenCitations",
			)!.setAttribute(
				"disabled",
				this.enableIndexer(OpenCitations, items) ? "false" : "true",
			);
		}

		(
			doc.getElementById(
				`wikicite-${menuName}submenu-separator`,
			)! as unknown as XULMenuSeparatorElement
		).hidden = !showSubmenu;
		(
			doc.getElementById(
				`wikicite-${menuName}submenu`,
			)! as unknown as XULMenuElement
		).hidden = !showSubmenu;
	}

	// Create Zotero item menu items as children of menuPopup
	createMenuItems(
		menuName: MenuSelectionType,
		IDPrefix: string,
	): MenuitemOptions[] {
		const options: MenuitemOptions[] = [];

		// Fetching menu items
		const fetchSubmenus: MenuitemOptions[] = [];
		const fetchPIDs: Map<
			MenuFunction,
			(menuName: MenuSelectionType) => void
		> = new Map([
			["getIdentifiers.QID", () => this.fetchQIDs(menuName)],
			[
				"getIdentifiers.OpenAlex",
				() => this.getPIDsFromIndexer(menuName, OpenAlex),
			],
			[
				"getIdentifiers.CorpusID",
				() => this.getPIDsFromIndexer(menuName, Semantic),
			],
		]);
		for (const [functionName, func] of fetchPIDs) {
			const menuFunc = this.zoteroMenuItem(
				menuName,
				functionName,
				func,
				IDPrefix,
			);
			fetchSubmenus.push(menuFunc);
		}
		options.push({
			tag: "menu",
			id: IDPrefix + "getIdentifiers",
			label: Wikicite.getString(`wikicite.submenu.get-identifiers`),
			children: fetchSubmenus,
		});

		// Get from citations menu item
		const citationsSubmenus: MenuitemOptions[] = [];
		const getCitations: Map<
			MenuFunction,
			(menuName: MenuSelectionType) => void
		> = new Map([
			[
				"getCitations.Crossref",
				() => this.getCitationsFromIndexer(menuName, Crossref),
			],
			[
				"getCitations.Semantic Scholar",
				() => this.getCitationsFromIndexer(menuName, Semantic),
			],
			[
				"getCitations.OpenAlex",
				() => this.getCitationsFromIndexer(menuName, OpenAlex),
			],
			[
				"getCitations.OpenCitations",
				() => this.getCitationsFromIndexer(menuName, OpenCitations),
			],
		]);
		for (const [functionName, func] of getCitations) {
			const menuFunc = this.zoteroMenuItem(
				menuName,
				functionName,
				func,
				IDPrefix,
			);
			citationsSubmenus.push(menuFunc);
		}
		options.push({
			tag: "menu",
			id: IDPrefix + "getCitations",
			label: Wikicite.getString(`wikicite.submenu.get-citations`),
			children: citationsSubmenus,
		});

		// Regular items
		const menuFunctions: Map<
			MenuFunction,
			(menuName: MenuSelectionType) => void
		> = new Map([
			["syncWithWikidata", () => this.syncWithWikidata(menuName)],
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
			);
			options.push(menuFunc);
		}

		options.push({
			tag: "menuseparator",
			id: IDPrefix + "separator",
		});

		options.push(
			this.zoteroMenuItem(
				menuName,
				"deleteCitations",
				() => {
					this.deleteCitations(menuName);
				},
				IDPrefix,
			),
		);

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
		if (
			functionName.includes("getCitations.") ||
			functionName.includes("getIdentifiers.")
		) {
			label = functionName.split(".")[1];
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
