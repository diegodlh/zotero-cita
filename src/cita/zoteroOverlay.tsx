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
import * as prefs from "./preferences";
import { Root, createRoot } from "react-dom/client";
import { initLocale, getLocaleID } from "../utils/locale";
import { getPrefGlobalName } from "../utils/prefs";
import { MenuitemOptions } from "zotero-plugin-toolkit/dist/managers/menu";
import Citation from "./citation";
import { IndexerBase } from "./indexer";
import PIDBoxContainer from "../containers/pidBoxContainer";
import { property } from "lodash";

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
	preferenceUpdateObservers?: symbol[];

	/******************************************/
	// Window load handling
	/******************************************/
	constructor(win: Window) {
		this.setDefaultPreferences();

		this.fullOverlay();

		this.addItemPaneColumns();

		this.addPreferenceUpdateObservers();

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

	async getCitationsFromIndexer<T extends IndexerBase<U>, U>(
		menuName: MenuSelectionType,
		indexer: T,
	) {
		const items = await this.getSelectedItems(menuName, true);
		if (items.length) {
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

		// Add Citations tab to item pane
		this.citationsPane();
		this.pidPane();

		this.addOverlayStyleSheet();
	}

	removeOverlay() {
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
		// but I couldn't get that to work, so add the CSS manually.
		const link = ztoolkit.UI.createElement(window.document, "link", {
			properties: {
				id: `${config.addonRef}-overlay-stylesheet`,
				rel: "stylesheet",
				href: `chrome://${config.addonRef}/content/skin/default/overlay.css`,
			},
		});
		window.document.documentElement.appendChild(link);
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
				const tab_id: string = body.closest("item-details")!.id;
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
				const tab_id: string = body.closest("item-details")!.id;
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
				setEnabled(item.isRegularItem());
				if (item.isRegularItem()) {
					this.setSourceItem(
						new SourceItemWrapper(item, prefs.getStorage()),
					);
				}
			},
		});
	}

	async pidPane() {
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
					onClick: ({ event, body }) => {
						const tab_id: string = body.closest("item-details")!.id;
						const pidAddMenu = document.getElementById(
							"pid-row-add-menu-" + tab_id,
						) as unknown as XULMenuPopupElement;
						pidAddMenu.openPopup(
							(event as CustomEvent).detail.button,
							"after_end",
						);
					},
				},
			],
			onInit: ({ body, doc }) => {
				const tab_id: string = body.closest("item-details")!.id;
				this.pidBoxRoots[tab_id] = createRoot(
					body.firstChild! as Element,
				);
				this.pidRowPopupMenu(doc, tab_id);
			},
			onRender: ({ body, item, setSectionButtonStatus }) => {
				window.MozXULElement.insertFTLIfNeeded(
					`${config.addonRef}-addon.ftl`,
				);

				if (!item.isRegularItem()) {
					return;
				}
				const tab_id: string = body.closest("item-details")!.id;
				this.pidBoxRoots[tab_id].render(
					<PIDBoxContainer
						key={"pidBox-" + item.id}
						item={item}
						tabID={tab_id}
						setSectionButtonStatus={(hidden) => {
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

	/** Item-wide popup menu to add new citations */
	itemAddMenu(doc: Document, mainWindow: Element) {
		const itemMenu = WikiciteChrome.createXULMenuPopup(
			doc,
			"citations-box-item-menu-add",
			[
				// Add existing Zotero item menu item
				{
					tag: "menuitem",
					id: "item-menu-add-zotero",
					label: Wikicite.getString("wikicite.item-menu.add-zotero"),
					commandListener: async () => {
						const selectedItems = await this.selectZoteroItems(
							this._sourceItem!.item.libraryID,
						);
						const targets = selectedItems.map(
							(item) =>
								new SourceItemWrapper(item, prefs.getStorage()),
						);
						this.addTargetsToSources(targets, [this._sourceItem!]);
					},
				},
				// Add citations by identifier menu item
				{
					tag: "menuitem",
					id: "item-menu-identifier-import",
					label: Wikicite.getString(
						"wikicite.item-menu.import-identifier",
					),
					commandListener: () =>
						this._sourceItem!.addCitationsByIdentifier(),
				},
				// Add item manually menu item
				{
					tag: "menuitem",
					id: "item-menu-add-manually",
					label: Wikicite.getString(
						"wikicite.item-menu.add-manually",
					),
					commandListener: () => this.handleCitationAdd(),
				},
			],
		);

		mainWindow.appendChild(itemMenu);
	}

	private indexerMenuAttributes<Ref>(
		IndexerType: new () => IndexerBase<Ref>,
	): MenuitemOptions {
		const indexer = new IndexerType();
		return {
			tag: "menuitem",
			// TODO: set an indexer id attribute
			id: `item-menu-${indexer.indexerName.toLowerCase().replace(" ", "-")}-get`,
			label: Wikicite.formatString(
				"wikicite.item-menu.get-indexer",
				indexer.indexerName,
			),
			commandListener: () => this._sourceItem!.getFrom(indexer),
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
					tag: "menuitem",
					id: "item-menu-pdf-extract",
					label: Wikicite.getString("wikicite.item-menu.get-pdf"),
					commandListener: () => this._sourceItem!.getFromPDF(),
					isDisabled: () =>
						!this._sourceItem!.item.getAttachments().length,
				},
				// Import citations menu item
				{
					tag: "menuitem",
					id: "item-menu-citations-import",
					label: Wikicite.getString(
						"wikicite.item-menu.import-citations",
					),
					commandListener: () => this._sourceItem!.importCitations(),
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
					tag: "menuitem",
					id: "item-menu-file-export",
					label: Wikicite.getString("wikicite.item-menu.export-file"),
					commandListener: () => this._sourceItem!.exportToFile(),
					isDisabled: () => !this._sourceItem!.citations.length,
				},
				// Export to CROCI menu item
				{
					tag: "menuitem",
					id: "item-menu-croci-export",
					label: Wikicite.getString(
						"wikicite.item-menu.export-croci",
					),
					commandListener: () => this._sourceItem!.exportToCroci(),
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
					tag: "menuitem",
					id: "item-menu-wikidata-sync",
					label: Wikicite.getString(
						"wikicite.item-menu.sync-wikidata",
					),
					commandListener: () => this._sourceItem!.syncWithWikidata(),
					isDisabled: () => !this._sourceItem!.qid,
				},
				// Fetch QIDs menu item
				{
					tag: "menuitem",
					id: "item-menu-fetch-citation-qids",
					label: Wikicite.getString(
						"wikicite.item-menu.fetch-citation-qids",
					),
					commandListener: () =>
						this._sourceItem!.fetchCitationQIDs(),
					isDisabled: () => !this._sourceItem!.citations.length,
				},
				// Auto-link citations menu item
				{
					tag: "menuitem",
					id: "item-menu-autolink-citations",
					label: Wikicite.getString(
						"wikicite.item-menu.autolink-citations",
					),
					commandListener: () =>
						this._sourceItem!.autoLinkCitations(),
				},
			],
		);

		// Sort-by submenu
		const sortValues: prefs.SortByType[] = [
			"ordinal",
			"authors",
			"date",
			"title",
		];
		const sortByValue = prefs.getSortBy();

		ztoolkit.Menu.register(
			itemMenu,
			{
				tag: "menu",
				id: "item-menu-sort-submenu",
				label: Wikicite.getString("wikicite.item-menu.sort"),
				popupId: "item-menu-sort-submenu-popup",
				children: sortValues.map((value): MenuitemOptions => {
					return {
						tag: "menuitem",
						id: "item-menu-sort-" + value,
						label: Wikicite.getString(
							"wikicite.item-menu.sort." + value,
						),
						type: "radio",
						checked: value === sortByValue || undefined,
						commandListener: () => prefs.setSortBy(value),
					};
				}),
			},
			"before",
			itemMenu.children[2] as XULElement,
		);

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
					tag: "menuitem",
					id: "citation-menu-wikidata-sync",
					label: Wikicite.getString(
						"wikicite.citation-menu.sync-wikidata",
					),
					commandListener: () =>
						this._sourceItem!.syncWithWikidata(this._citationIndex),
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
					tag: "menuitem",
					id: "citation-menu-fetch-qid",
					label: Wikicite.getString(
						"wikicite.citation-menu.fetch-qid",
					),
					commandListener: () =>
						this._sourceItem!.fetchCitationQIDs(
							this._citationIndex,
						),
				},
				// Export to file
				{
					tag: "menuitem",
					id: "citation-menu-file-export",
					label: Wikicite.getString(
						"wikicite.citation-menu.export-file",
					),
					commandListener: () =>
						this._sourceItem!.exportToFile(this._citationIndex),
				},
				// Export to Croci
				{
					tag: "menuitem",
					id: "citation-menu-croci-export",
					label: Wikicite.getString(
						"wikicite.citation-menu.export-croci",
					),
					commandListener: () =>
						this._sourceItem!.exportToCroci(this._citationIndex),
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
		const ociSupplierItems: Array<MenuitemOptions> = [
			"crossref",
			"occ",
			"wikidata",
		].map((supplier) => {
			return {
				tag: "menuitem",
				id: "citation-menu-oci-" + supplier,
				label: Wikicite.getString(
					"wikicite.citation-menu.oci." + supplier,
				),
				commandListener: () =>
					this._sourceItem!.citations[
						this._citationIndex!
					].resolveOCI(supplier),
				isDisabled: () => {
					const sourceItem = this._sourceItem;
					const citation =
						sourceItem?.citations[this._citationIndex!];
					const ociSuppliers = citation?.ocis.map(
						(oci) => oci.supplierName,
					);
					return !ociSuppliers?.includes(supplier);
				},
			};
		});

		ztoolkit.Menu.register(citationMenu, {
			tag: "menu",
			id: "citation-menu-oci-submenu",
			label: Wikicite.getString("wikicite.citation-menu.oci"),
			popupId: "citation-menu-oci-submenu-popup",
			children: ociSupplierItems,
		});

		mainWindow.appendChild(citationMenu);
	}

	/** Popup menu for adding new PID rows */
	pidRowPopupMenu(doc: Document, tabID: string) {
		const mainWindow = doc.getElementById("main-window")!;
		const pidRowMenu = WikiciteChrome.createXULMenuPopup(
			doc,
			"pid-row-add-menu-" + tabID,
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

	// /******************************************/
	// // Item menu functions
	// /******************************************/
	/** Create XUL for Zotero menu elements */
	zoteroPopup(menuName: MenuSelectionType, doc: Document) {
		const showSubmenu = (menu: MenuSelectionType) => {
			switch (menu) {
				case "collection": {
					// Show collection submenu for collections, libraries, and groups only
					const collectionTreeRow = ZoteroPane.getCollectionTreeRow();
					if (
						collectionTreeRow &&
						!collectionTreeRow.isCollection() &&
						!collectionTreeRow.isLibrary() &&
						!collectionTreeRow.isGroup()
					) {
						return false;
					}
					break;
				}
				case "item":
					// Show item submenu for regular items only
					if (
						!ZoteroPane.getSelectedItems().some((item) =>
							item.isRegularItem(),
						)
					) {
						return false;
					}
					break;
			}
			return true;
		};

		// Wikicite submenu
		ztoolkit.Menu.register(menuName, {
			tag: "menuseparator",
			id: `wikicite-${menuName}submenu-separator`,
			isHidden: () => !showSubmenu(menuName),
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
			isHidden: () => !showSubmenu(menuName),
		});
	}

	private enableIndexer<T extends IndexerBase<U>, U>(
		indexer: T,
		items: Zotero.Item[],
	): boolean {
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
		const indexers = [Crossref, Semantic, OpenAlex, OpenCitations];
		for (const IndexerType of indexers) {
			const indexer = new IndexerType();
			const functionName =
				`getCitations.${indexer.indexerName}` as MenuFunction;
			const menuFunc = this.zoteroMenuItem(
				menuName,
				functionName,
				() => this.getCitationsFromIndexer(menuName, indexer),
				IDPrefix,
			);
			menuFunc.isDisabled = () =>
				menuName === "item" &&
				!this.enableIndexer(indexer, ZoteroPane.getSelectedItems());
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
			if (functionName === "localCitationNetwork") {
				menuFunc.isDisabled = () =>
					menuName === "item" &&
					ZoteroPane.getSelectedItems().length <= 1;
			}
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
