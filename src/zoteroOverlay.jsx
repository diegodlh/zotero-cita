import Wikicite, { debug } from './wikicite';
import Citations from './citations';
import Citation from './citation';
import CitationsBoxContainer from './containers/citationsBoxContainer';
import Crossref from './crossref';
import Extraction from './extract';
import LCN from './localCitationNetwork';
import OpenCitations from './opencitations';
import React from 'react';
import ReactDOM from 'react-dom';
import SourceItemWrapper from './sourceItemWrapper';
import WikiciteChrome from './wikiciteChrome';
import Wikidata from './wikidata';
import wikicite from './wikicite';

const TRANSLATORS_PATH = 'chrome://cita/content/translators/'
const TRANSLATOR_LABELS = [
    'Wikidata API',
    'Wikidata JSON',
    'Wikidata QuickStatements'
];

const COLUMN_IDS = {
    QID: 'qid',
    CITATIONS: 'citations'
}
const CITA_COLUMNS = [COLUMN_IDS.QID, COLUMN_IDS.CITATIONS];

/* global AddonManager */
/* global window, document, Components, MutationObserver*/
/* global Services */
/* global Zotero, ZoteroPane */
/* global performance */

Components.utils.import("resource://gre/modules/AddonManager.jsm");
Components.utils.import('resource://zotero/config.js');

// needed as a separate function, because zoteroOverlay.refreshZoteroPopup refers to `this`, and a bind would make it
// two separate functions in add/remove eventlistener
function refreshItemSubmenu() {
    zoteroOverlay.refreshZoteroPopup('item', document);
}
function refreshCollectionSubmenu() {
    zoteroOverlay.refreshZoteroPopup('collection', document);
}

function refreshCitationsPane(event) {
    // if (event.target !== 'zotero-view-item') {
    //     zoteroOverlay.refreshCitationsPane(document, event.target);
    // }
    let target;
    if (event) {
        target = event.target;
    } else {
        // if listener is called via an object's runListeners method,
        // it is called without an event,
        // but with the object as the listener's this value
        target = { id: this.id }
    }
    zoteroOverlay.refreshCitationsPane(document, target);
}

function updateCitationsBoxSize() {
    zoteroOverlay.updateCitationsBoxSize(document);
}

function handleItemPopupShowing() {
    zoteroOverlay.handleItemPopupShowing(document);
}

function handleCitationPopupShowing() {
    zoteroOverlay.handleCitationPopupShowing(document);
}

// Fixme: change to Class?
const zoteroOverlay = {
    /******************************************/
    // Window load handling
    /******************************************/
    init: function() {
        // retrieve and set addon version
        AddonManager.getAddonByID(Wikicite.id, (addon) => {
            Wikicite.version = addon.version
        });

        this.fullOverlay();

        // refresh item and collection submenus each time they show
        document.getElementById('zotero-itemmenu').addEventListener(
            'popupshowing', refreshItemSubmenu, false
        );
        document.getElementById('zotero-collectionmenu').addEventListener(
            'popupshowing', refreshCollectionSubmenu, false
        );

        // document.getElementById('zotero-view-tabbox').addEventListener('select', refreshCitationsPane, false);
        document.getElementById('zotero-editpane-tabs').addEventListener('select', refreshCitationsPane, false);
        Zotero.uiReadyPromise.then(
            () => {
                debug('Adding refreshCitationsPane listener to ZoteroPane.itemsView "select" listeners');
                ZoteroPane.itemsView.onSelect.addListener(refreshCitationsPane);
            }
        );

        // Update citations box list height...
        // Fixme: Try and solve this using CSS alone!
        // ...when window resizes,
        window.addEventListener('resize', updateCitationsBoxSize);
        // ...splitter is moved,
        document.getElementById('zotero-items-splitter').addEventListener('mousemove', updateCitationsBoxSize, false);
        document.getElementById('zotero-items-splitter').addEventListener('command', updateCitationsBoxSize, false);
        // ...layout is changed
        const observer = new MutationObserver(
            (mutationsList, observer) => {
                for(const mutation of mutationsList) {
                    if (mutation.attributeName == 'orient') {
                        updateCitationsBoxSize();
                    }
                }
            }
        );
        observer.observe(
            document.getElementById('zotero-layout-switcher'),
            { attributes: true }
        );
        this.switcherObserver = observer;

        this.installTranslators();

        // Code from better Bibtex used as example:
        // https://github.com/retorquere/zotero-better-bibtex/blob/d6b21b855237f05e7ab48b5a52d0188227dd044e/content/better-bibtex.ts#L267
        // This first half of the if statement is for compatibility with newer versions of Zotero after this commit:
        // https://github.com/zotero/zotero/commit/cbbff600a60c9e7a7407d6f2e4053309bf28b872#diff-f9d76d8fc0067fd30009f09edd0404cd7e58fd2b3366cd15bc1982e168da1db9
        if (typeof Zotero.ItemTreeView === 'undefined') {
            const itemTree = require('zotero@zotero/itemTree');

            const getColumns_original = itemTree.prototype.getColumns;
            itemTree.prototype.getColumns = function () {
                const columns = getColumns_original.apply(this, arguments);
                columns.push({
                    dataKey: COLUMN_IDS.QID,
                    label: Wikicite.getString('wikicite.item-tree.column-label.qid'),
                    flex: '1',
                    zoteroPersist: new Set(['width', 'ordinal', 'hidden', 'sortActive', 'sortDirection']),
                });
                columns.push({
                    dataKey: COLUMN_IDS.CITATIONS,
                    label: Wikicite.getString('wikicite.item-tree.column-label.citations'),
                    flex: '1',
                    zoteroPersist: new Set(['width', 'ordinal', 'hidden', 'sortActive', 'sortDirection']),
                });

                return columns
            };

            const renderCell_original = itemTree.prototype._renderCell;
            itemTree.prototype._renderCell = function (index, data, col) {
                if (!CITA_COLUMNS.includes(col.id)) {
                    return renderCell_original.apply(this, arguments);
                }

                const text = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
                text.className = 'cell-text';
                text.innerText = data;

                const cell = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
                cell.className = `cell ${col.className}`;
                cell.append(text);

                return cell;
            };
        }
        else {
            const getCellText_original = Zotero.ItemTreeView.prototype.getCellText;
            Zotero.ItemTreeView.prototype.getCellText = function (row, col) {
                const item = this.getRow(row).ref;
                if (col.id == COLUMN_IDS.QID) {
                    return `${new SourceItemWrapper(item, window.Wikicite.Prefs.get('storage')).getPID('QID') || ''}`;
                }
                else if (col.id == COLUMN_IDS.CITATIONS) {
                    return `${new SourceItemWrapper(item, window.Wikicite.Prefs.get('storage')).citations.length || '0'}`;
                }
                else return getCellText_original.apply(this, arguments);
            };
        }

        const isFieldOfBase_original = Zotero.ItemFields.isFieldOfBase;
        Zotero.ItemFields.isFieldOfBase = function (field, _baseField) {
            if (CITA_COLUMNS.includes(field)) return false
            return isFieldOfBase_original.apply(this, arguments)
        }


        // To be able to sort by the QID or citations columns
        const getField_original = Zotero.Item.prototype.getField;
        Zotero.Item.prototype.getField = function (field, unformatted, includeBaseMapped) {
            if (!CITA_COLUMNS.includes(field)) {
                return getField_original.apply(this, arguments);
            }

            if (this.isRegularItem()){
                try{
                    if (field == COLUMN_IDS.QID){
                        return `${new SourceItemWrapper(this, window.Wikicite.Prefs.get('storage')).getPID('QID') || ''}`;
                    }
                    else if (field == COLUMN_IDS.CITATIONS){
                        return `${new SourceItemWrapper(this, window.Wikicite.Prefs.get('storage')).citations.length || 0}`;
                    }
                }
                catch (err){
                    Zotero.logError(err)
                    return 'error';
                }
            }
            else{
                return '';
            }
        }

        this.addNewTabListener()
    },

    unload: function() {
        var toolsPopup = document.getElementById('menu_ToolsPopup')
        toolsPopup.removeEventListener('popupshowing',
            zoteroOverlay.prefsSeparatorListener, false)

        document.getElementById('zotero-itemmenu').removeEventListener(
            'popupshowing', refreshItemSubmenu, false
        );
        document.getElementById('zotero-collectionmenu').removeEventListener(
            'popupshowing', refreshCollectionSubmenu, false
        );

        document.getElementById('zotero-editpane-tabs').removeEventListener('select', refreshCitationsPane, false)
        // todo: find a better way to remove event listener
        // https://groups.google.com/g/zotero-dev/c/_HDsAc5HPac
        let itemsViewSelectListeners;
        if (ZoteroPane.itemsView._listeners) {
            itemsViewSelectListeners = ZoteroPane.itemsView._listeners.select
        } else if (ZoteroPane.itemsView._events && ZoteroPane.itemsView._events.select) {
            // JSX-ified ZoteroPane
            itemsViewSelectListeners = ZoteroPane.itemsView._events.select.listeners
        }
        if (itemsViewSelectListeners) {
            debug('Removing refreshCitationsPane listener from ZoteroPane.itemsView "select" event listeners');
            itemsViewSelectListeners.delete(refreshCitationsPane);
        }

        window.removeEventListener('resize', updateCitationsBoxSize);
        document.getElementById('zotero-items-splitter').removeEventListener('mousemove', updateCitationsBoxSize, false);
        document.getElementById('zotero-items-splitter').removeEventListener('command', updateCitationsBoxSize, false);
        this.switcherObserver.disconnect();

        this.uninstallTranslators();
        this.removeNewTabListener()
    },

    /******************************************/
    // Notifiers
    /******************************************/
    // Listen for the creation of a new PDF reader tab, then add the citations menu to it

    addNewTabListener: function() {
        this.notifierID = Zotero.Notifier.registerObserver(this.tabEventCallback, ["tab"])
    },

    removeNewTabListener: function() {
        Zotero.Notifier.unregisterObserver(this.notifierID);
    },

    // Approach from Zotero PDF Translate
    // https://github.com/windingwind/zotero-pdf-translate/blob/307b6e4169a925d4152a0dc0bb88fdeba238222e/src/events.ts#L21
    tabEventCallback: {
        notify: async function(event, type, ids, extraData){
            // adding the Citations menu when selecting a tab for the first time seems
            // more robust than doing it when the tab is created
            if (event == "select" && type == "tab" && extraData[ids[0]].type == "reader"){
                let reader = Zotero.Reader.getByTabID(ids[0]);
                let delayCount = 0;
                // Wait for the reader tab to be ready
                while (!reader && delayCount < 10) {
                    await Zotero.Promise.delay(100);
                    reader = Zotero.Reader.getByTabID(ids[0]);
                    delayCount++;
                }
                await reader?._initPromise;
                
                // Only add a citations tab if the PDF has a parent item to add citations to
                if (Zotero.Items.get(reader.itemID).parentItem) {
                    const pdfReaderTabbox = document.getElementById(`${ids[0]}-context`).querySelector(".zotero-view-tabbox")
                    // only add the citations pane and refresh listener to this tab if they aren't already
                    if (!pdfReaderTabbox.querySelector('#citations-pane')) {
                        zoteroOverlay.citationsPane(document, pdfReaderTabbox);
                        pdfReaderTabbox.querySelector('.zotero-editpane-tabs').addEventListener('select', refreshCitationsPane, false);
                    }
                }
            }
        }
    },

    /******************************************/
    // Translators
    /******************************************/
    // based on Better BibTex translators

    installTranslators: async function() {
        // Wait until Zotero.Translators is ready
        await Zotero.Schema.schemaUpdatePromise;
        for (const label of TRANSLATOR_LABELS) {
            this.installTranslator(label);
        }
        Zotero.Translators.reinit();
    },

    uninstallTranslators: function() {
        for (const label of TRANSLATOR_LABELS) {
            this.uninstallTranslator(label);
        }
        Zotero.Translators.reinit();
    },

    installTranslator: async function(label) {
        const source = Zotero.File.getContentsFromURL(
            `${TRANSLATORS_PATH}${label}.js`
        );
        const header = (/^\s*{[\S\s]*?}\s*?[\r\n]/).exec(source)[0];
        const metadata = JSON.parse(header);
        const code = source.replace(header, '');
        const installed = Zotero.Translators.get(metadata.translatorID);
        if (installed) {
            const newDate = new Date(metadata.lastUpdated);
            const oldDate = new Date(installed.lastUpdated);
            if (oldDate > newDate) {
                // do not install
                debug('Skipping installation of translator ' + label);
                return;
            }
        }
        try {
            await Zotero.Translators.save(metadata, code);
        } catch (err) {
            debug(`Failed to install translator ${label}`, err);
            this.uninstallTranslator(label);
        }
    },

    uninstallTranslator: function(label) {
        try {
            const fileName = Zotero.Translators.getFileNameFromLabel(label)
            const destFile = Zotero.getTranslatorsDirectory()
            destFile.append(fileName)
            if (destFile.exists()) {
                destFile.remove(false)
            }
        } catch (err) {
            debug(`Failed to remove translator ${label}`, err)
        }
    },

    /******************************************/
    // Functions for item tree batch actions
    /******************************************/
    /**
     * Return selected regular items
     * @param {String} menuName Zotero popup menu firing the action: 'item' or 'collection'
     * @param {Boolean} [wrap=true] Whether to return wrapped items or not
     * @return {Array} Array of selected regular items
     */
    getSelectedItems: async function(menuName, wrap=true) {
        // Fixme: Consider using the Citations class methods instead
        let items;
        switch (menuName) {
            case 'item': {
                items = ZoteroPane.getSelectedItems()
                break;
            }
            case 'collection': {
                const collectionTreeRow = ZoteroPane.getCollectionTreeRow();
                if (collectionTreeRow.isCollection()) {
                    const collection = ZoteroPane.getSelectedCollection();
                    items = collection.getChildItems();
                } else if (collectionTreeRow.isLibrary() || collectionTreeRow.isGroup()) { // Also account for group libraries #193
                    const libraryID = ZoteroPane.getSelectedLibraryID();
                    items = await Zotero.Items.getAll(libraryID);
                }
                break;
            }
        }
        items = items.filter((item) => item.isRegularItem());
        if (wrap) items = items.map((item) => new SourceItemWrapper(item, window.Wikicite.Prefs.get('storage')));
        return items;
    },

    fetchQIDs: async function(menuName) {
        const items = await this.getSelectedItems(menuName);
        const qidMap = await Wikidata.reconcile(items);
        for (const item of items) {
            const qid = qidMap.get(item);
            if (qid) item.qid = qid;
        }
    },

    /**
     * Set the URL value of a Zotero item with the value of it's P953 wikidata element statement 
     */
    fetchOpenAccessUrls: async function(menuName) {
        const items = await this.getSelectedItems(menuName);

        for (const item of items) {
            // get the QID of the item
            const qid = item.getPID('QID');

            debug('QID : ' + qid);

            // fetch the value of the P953 of the element
            const OpenAccessUrl = await Wikidata.getProperties(qid, 'openAccessUrl');
            
            debug('Open Access URL fetched as : ' + JSON.stringify(OpenAccessUrl));
            // debug ex: Open Access URL fetched as : {"Q115183044":{"openAccessUrl":[]}}

            // for each targetItem set the url field with the new Open Access url
            item.setPID('url', OpenAccessUrl);
        }
    },

    syncWithWikidata: async function(menuName) {
        const items = await this.getSelectedItems(menuName);
        if (items.length) {
            Citations.syncItemCitationsWithWikidata(items);
        }
    },

    getFromCrossref: function(menuName) {
        // get items selected
        // filter items with doi
        // generate batch call to crossref
        // only add items not available locally yet
        Crossref.getCitations();
    },

    getFromOCC: function(menuName) {
        OpenCitations.getCitations();
    },

    getFromAttachments: function(menuName) {
        // I don't think there's a need to batch call the extractor here
        // get selected items
        // filter by items with attachments
        // call the extract method once per item
        // maybe call it in a way it doesn't fail if pdf is not readable
        // call it with one pdf
        Extraction.extract();
    },

    /** 
     * Add selected items as citation target items of one or more source items
     */
    addAsCitations: async function(menuName) {
        // get citation target items (currently selected) - don't wrap them
        const targetItems = await this.getSelectedItems(menuName, false);

        // open selectItemsDialog to get source items
        const io = {singleSelection: false, dataOut: null};
        window.openDialog(
            'chrome://zotero/content/selectItemsDialog.xul',
            '',
            'chrome,dialog=no,modal,centerscreen,resizable=yes',
            io
        );
        if (!io.dataOut || !io.dataOut.length) {
            return;
        }
        const sourceItemIDs = io.dataOut;

        // wrap source items in SourceItemWrapper
        const sourceItems = sourceItemIDs.map((id) => new SourceItemWrapper(Zotero.Items.get(id), window.Wikicite.Prefs.get('storage')));

        // create a citation between each source and target item, giving the Zotero item key so they're automatically linked
        for (const sourceItem of sourceItems) {
            const citations = targetItems.map((targetItem) => new Citation({item: targetItem, ocis: [], zotero: targetItem.key}, sourceItem));
            sourceItem.addCitations(citations);
        }
    },

    localCitationNetwork: async function(menuName) {
        const items = await this.getSelectedItems(menuName, false);
        if (items.length) {
            const lcn = new LCN(items);
            await lcn.init();
            lcn.show();
        }
    },


    /******************************************/
    // XUL overlay functions
    /******************************************/
    fullOverlay: function() {
        // Add all Wikicite overlay elements to the window
        zoteroOverlay.overlayZoteroPane(document)
    },

    overlayZoteroPane: function(doc) {
        // add wikicite preferences command to tools popup menu
        var menuPopup
        menuPopup = doc.getElementById('menu_ToolsPopup')
        zoteroOverlay.prefsMenuItem(doc, menuPopup)
        // add wikicite submenu to item and collection menus
        zoteroOverlay.zoteroPopup('item', doc);
        zoteroOverlay.zoteroPopup('collection', doc);

        // Add Citations tab to item pane
        var itemPaneTabbox = doc.getElementById('zotero-view-tabbox');
        zoteroOverlay.citationsPane(doc, itemPaneTabbox);

        // Add popup menus to main window
        const mainWindow = doc.getElementById('main-window');
        zoteroOverlay.itemPopupMenu(doc, mainWindow);
        zoteroOverlay.citationPopupMenu(doc, mainWindow);

        // we only want to run this for older versions of Zotero
        if (typeof Zotero.ItemTreeView !== 'undefined') {
            const itemTreeColumnHeader = doc.getElementById('zotero-items-columns-header');
            zoteroOverlay.itemTreeColumnHeaders(doc, itemTreeColumnHeader);
        }
    },

    /******************************************/
    // Item tree functions
    /******************************************/
    // Create QID column header in item tree
    itemTreeColumnHeaders: function (doc, tree) {
        const getTreecol = (treecolID, label) => {
            const treecol = doc.createElement('treecol');
            treecol.setAttribute('id', treecolID);
            treecol.setAttribute('label', label);
            treecol.setAttribute('flex', '1');
            treecol.setAttribute('zotero-persist', 'width ordinal hidden sortActive sortDirection');
            return treecol;
        }
        const getSplitter = () => {
            const splitter = doc.createElement('splitter');
            splitter.setAttribute('class', 'tree-splitter');
            return splitter;
        }
        const treecolQID_ID = COLUMN_IDS.QID;
        const treecolQID = getTreecol(treecolQID_ID, Wikicite.getString('wikicite.item-tree.column-label.qid'));
        const treecolCitations_ID = COLUMN_IDS.CITATIONS;
        const treecolCitations = getTreecol(treecolCitations_ID, Wikicite.getString('wikicite.item-tree.column-label.citations'));
        tree.appendChild(getSplitter());
        tree.appendChild(treecolQID);
        tree.appendChild(getSplitter());
        tree.appendChild(treecolCitations);
        WikiciteChrome.registerXUL(treecolQID_ID, doc);
        WikiciteChrome.registerXUL(treecolCitations_ID, doc);
    },

    prefsMenuItem: function(doc, menuPopup) {
        // Add Wikicite preferences item to Tools menu
        if (menuPopup === null) {
            // Don't do anything if elements not loaded yet
            return;
        }

        var wikiciteMenuItem = doc.createElement('menuitem')
        var wikiciteMenuItemID = 'wikicite-preferences'
        wikiciteMenuItem.setAttribute('id', wikiciteMenuItemID)
        wikiciteMenuItem.setAttribute(
            'label',
            Wikicite.getString('wikicite.preferences.menuitem')
        )
        wikiciteMenuItem.addEventListener('command',
            function() {
                WikiciteChrome.openPreferences()
            }, false)

        menuPopup.appendChild(wikiciteMenuItem)

        WikiciteChrome.registerXUL(wikiciteMenuItemID, doc)
    },

    /******************************************/
    // Item pane functions
    /******************************************/
    // Create XUL for Zotero item pane
    citationsPane: function(doc, tabbox) {
        var tabs = tabbox.querySelector('tabs');
        var citationsTab = doc.createElement('tab');
        var citationsTabID = 'zotero-editpane-citations-tab';
        citationsTab.setAttribute('id', citationsTabID);
        citationsTab.setAttribute(
            'label',
            Wikicite.getString('wikicite.citations-pane.label')
        )
        tabs.appendChild(citationsTab);
        WikiciteChrome.registerXUL(citationsTabID, doc)

        var tabpanels = tabbox.querySelector('tabpanels');
        var citationsTabPanel = doc.createElement('tabpanel');
        var citationsTabPanelID = 'citations-pane';
        citationsTabPanel.setAttribute('id', citationsTabPanelID);
        // citationsTabPanel.setAttribute('orient', 'vertical');
        tabpanels.appendChild(citationsTabPanel);
        WikiciteChrome.registerXUL(citationsTabPanelID, doc);

        var citationsBoxContainer = doc.createElementNS(
            'http://www.w3.org/1999/xhtml',
            'html:div'
        );
        citationsBoxContainer.setAttribute('id', 'citations-box-container');
        citationsTabPanel.appendChild(citationsBoxContainer);
    },

    // Item-wide popup menu
    itemPopupMenu: function(doc, mainWindow) {
        const itemMenu = doc.createElement('menupopup');
        const itemMenuID = 'citations-box-item-menu';
        itemMenu.setAttribute('id', itemMenuID);
        itemMenu.addEventListener('popupshowing', handleItemPopupShowing);

        // Sync with Wikidata menu item

        const itemWikidataSync = doc.createElement('menuitem');
        itemWikidataSync.setAttribute('id', 'item-menu-wikidata-sync');
        itemWikidataSync.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.sync-wikidata')
        );
        itemWikidataSync.addEventListener(
            'command', () => this._sourceItem.syncWithWikidata()
        );

        // Fetch QIDs menu item

        const itemFetchCitationQIDs = doc.createElement('menuitem');
        itemFetchCitationQIDs.setAttribute('id', 'item-menu-fetch-citation-qids');
        itemFetchCitationQIDs.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.fetch-citation-qids')
        );
        itemFetchCitationQIDs.addEventListener(
            'command', () => this._sourceItem.fetchCitationQIDs()
        );

        // Get Crossref citations menu item

        const itemCrossrefGet = doc.createElement('menuitem');
        itemCrossrefGet.setAttribute('id', 'item-menu-crossref-get');
        itemCrossrefGet.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.get-crossref')
        );
        itemCrossrefGet.addEventListener(
            'command', () => this._sourceItem.getFromCrossref()
        );

        // Get OCC citations menu item

        const itemOccGet = doc.createElement('menuitem');
        itemOccGet.setAttribute('id', 'item-menu-occ-get');
        itemOccGet.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.get-occ')
        );
        itemOccGet.addEventListener(
            'command', () => this._sourceItem.getFromOCC()
        );

        // Extract citations menu item

        const itemPdfExtract = doc.createElement('menuitem');
        itemPdfExtract.setAttribute('id', 'item-menu-pdf-extract');
        itemPdfExtract.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.get-pdf')
        );
        itemPdfExtract.addEventListener(
            'command', () => this._sourceItem.getFromPDF()
        );

        // Add citations by identifier menu item

        const itemIdentifierImport = doc.createElement('menuitem');
        itemIdentifierImport.setAttribute('id', 'item-menu-identifier-import');
        itemIdentifierImport.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.import-identifier')
        );
        itemIdentifierImport.addEventListener(
            'command', () => this._sourceItem.addCitationsByIdentifier()
        );

        // Import citations menu item

        const itemCitationsImport = doc.createElement('menuitem');
        itemCitationsImport.setAttribute('id', 'item-menu-citations-import');
        itemCitationsImport.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.import-citations')
        );
        itemCitationsImport.addEventListener(
            'command', () => this._sourceItem.importCitations()
        );

        // Export to file menu item

        const itemFileExport = doc.createElement('menuitem');
        itemFileExport.setAttribute('id', 'item-menu-file-export');
        itemFileExport.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.export-file')
        );
        itemFileExport.addEventListener(
            'command', () => this._sourceItem.exportToFile()
        );

        // Export to CROCI menu item

        const itemCrociExport = doc.createElement('menuitem');
        itemCrociExport.setAttribute('id', 'item-menu-croci-export');
        itemCrociExport.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.export-croci')
        );
        itemCrociExport.addEventListener(
            'command', () => this._sourceItem.exportToCroci()
        );

        // Sort-by submenu

        const menuSort = doc.createElement('menu');
        menuSort.setAttribute('id', 'item-menu-sort-submenu');
        menuSort.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.sort')
        );

        const sortPopup = doc.createElement('menupopup');
        sortPopup.setAttribute('id', 'item-menu-sort-submenu-popup');

        menuSort.appendChild(sortPopup);

        const sortValues = ['ordinal', 'authors', 'date', 'title'];
        const sortByValue = window.Wikicite.Prefs.get('sortBy');
        for (const value of sortValues) {
            const itemSort = doc.createElement('menuitem');
            itemSort.setAttribute('id', 'item-menu-sort-' + value);
            itemSort.setAttribute(
                'label', Wikicite.getString('wikicite.item-menu.sort.' + value)
            );
            itemSort.setAttribute('type', 'radio');
            if (value === sortByValue) {
                itemSort.setAttribute('checked', true);
            }
            itemSort.addEventListener(
                'command', () => window.Wikicite.Prefs.set('sortBy', value)
            );
            sortPopup.appendChild(itemSort);
        }

        // Auto-link citations menu item

        const autoLinkCitations = doc.createElement('menuitem');
        autoLinkCitations.setAttribute('id', 'item-menu-autolink-citations');
        autoLinkCitations.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.autolink-citations')
        );
        autoLinkCitations.addEventListener(
            'command', () => this._sourceItem.autoLinkCitations()
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
    },

    // Citation-specific popup menu
    citationPopupMenu: function(doc, mainWindow) {
        const citationMenu = doc.createElement('menupopup');
        const citationMenuID = 'citations-box-citation-menu';
        citationMenu.setAttribute('id', citationMenuID);
        citationMenu.addEventListener('popupshowing', handleCitationPopupShowing);

        const citationWikidataSync = doc.createElement('menuitem');
        citationWikidataSync.setAttribute('id', 'citation-menu-wikidata-sync');
        citationWikidataSync.setAttribute(
            'label', Wikicite.getString('wikicite.citation-menu.sync-wikidata')
        );
        citationWikidataSync.addEventListener(
            'command', () => this._sourceItem.syncWithWikidata(this._citationIndex)
        );

        const citationFetchQID = doc.createElement('menuitem');
        citationFetchQID.setAttribute('id', 'citation-menu-fetch-qid');
        citationFetchQID.setAttribute(
            'label', Wikicite.getString('wikicite.citation-menu.fetch-qid')
        );
        citationFetchQID.addEventListener(
            'command', () => this._sourceItem.fetchCitationQIDs(this._citationIndex)
        );

        const itemFileExport = doc.createElement('menuitem');
        itemFileExport.setAttribute('id', 'citation-menu-file-export');
        itemFileExport.setAttribute(
            'label', Wikicite.getString('wikicite.citation-menu.export-file')
        );
        itemFileExport.addEventListener(
            'command', () => this._sourceItem.exportToFile(this._citationIndex)
        );

        const itemCrociExport = doc.createElement('menuitem');
        itemCrociExport.setAttribute('id', 'citation-menu-croci-export');
        itemCrociExport.setAttribute(
            'label', Wikicite.getString('wikicite.citation-menu.export-croci')
        );
        itemCrociExport.addEventListener(
            'command', () => this._sourceItem.exportToCroci(this._citationIndex)
        );

        // Fixme: but OCI has two more suppliers: Dryad and CROCI
        // Maybe I should have all of them, and show only the available ones
        // for any one citation?
        const ociMenu = doc.createElement('menu');
        ociMenu.setAttribute('id', 'citation-menu-oci-submenu');
        ociMenu.setAttribute(
            'label', Wikicite.getString('wikicite.citation-menu.oci')
        );

        const ociPopup = doc.createElement('menupopup');
        ociPopup.setAttribute('id', 'citation-menu-oci-submenu-popup');
        ociMenu.appendChild(ociPopup);

        for (const supplier of ['crossref', 'occ', 'wikidata']) {
            const ociItem = doc.createElement('menuitem');
            ociItem.setAttribute('id', 'citation-menu-oci-' + supplier);
            ociItem.setAttribute(
                'label', Wikicite.getString('wikicite.citation-menu.oci.' + supplier)
            );
            ociItem.addEventListener(
                'command',
                () => this._sourceItem.citations[this._citationIndex].resolveOCI(supplier)
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
    },

    refreshCitationsPane: function(document, target) {
        var item, zoteroViewTabbox, editPaneTabs;
        // different ways of getting the selected item if we're in the library or PDF reader
        const selectedTab = Zotero_Tabs._tabs[Zotero_Tabs.selectedIndex];
        if (selectedTab.type == "library"){
            const selectedItems = ZoteroPane.getSelectedItems();
            if (selectedItems.length == 1) {
                var item = selectedItems[0];
            }
            zoteroViewTabbox = document.getElementById('zotero-view-tabbox');
            editPaneTabs = document.getElementById('zotero-editpane-tabs');
        }
        else if (selectedTab.type == "reader"){
            item = Zotero.Items.get(selectedTab.data.itemID).parentItem;
            zoteroViewTabbox = document.querySelector(`#${selectedTab.id}-context .zotero-view-tabbox`);
            editPaneTabs = document.querySelector(`#${selectedTab.id}-context .zotero-editpane-tabs`);
        }
        
        if (item && item.isRegularItem() && !item.isFeedItem) {
            const citationsTabIndex = Array.from(editPaneTabs.children).findIndex(child => child.id === 'zotero-editpane-citations-tab');
            if (zoteroViewTabbox.selectedIndex === citationsTabIndex) {
                // fix: runs twice when tab is changed to Citations
                debug(`Refreshing citations pane... (${target.id})`);
                const t0 = performance.now();
                ReactDOM.render(
                    <CitationsBoxContainer
                        //Having the key change, makes the CitationsBoxContainer
                        //component unmount when the item selected changes
                        key={"citationsBox-" + item.id}
                        item={item}
                        editable={ZoteroPane.collectionsView.editable}
                        onSourceItem={this.handleSourceItem}
                    // citationIndexRef={this._citationIndex}
                    // In principle I don't need a ref; I may have to use it if I need to force blur
                    // ref={_citationsBox}
                    // onResetSelection={focusItemsList}
                    />,
                    zoteroViewTabbox.querySelector('#citations-box-container'), // only the active one appears
                    () => this.updateCitationsBoxSize(document)
                );
                const t1 = performance.now();
                debug(`Rendering CitationsBoxContainer took ${t1-t0}ms.`);
            }
        }
    },

    // Fixme: make zoteroOverlay a class and this a getter/setter property
    setSourceItem: function(sourceItem) {
        this._sourceItem = sourceItem;
    },

    setCitationIndex: function(citationIndex) {
        this._citationIndex = citationIndex;
    },

    _sourceItem: undefined,
    _citationIndex: undefined,

    handleItemPopupShowing: function(document) {
        const sourceItem = this._sourceItem;

        const hasAttachments = Boolean(sourceItem.item.getAttachments().length);
        const hasCitations = Boolean(sourceItem.citations.length);
        const sourceDoi = sourceItem.doi;
        const sourceOcc = sourceItem.occ;
        const sourceQid = sourceItem.qid;

        const itemWikidataSync = document.getElementById('item-menu-wikidata-sync');
        const itemFetchCitationQIDs = document.getElementById('item-menu-fetch-citation-qids');
        const itemCrossrefGet = document.getElementById('item-menu-crossref-get');
        const itemOccGet = document.getElementById('item-menu-occ-get');
        const itemPdfExtract = document.getElementById('item-menu-pdf-extract');
        const itemIdentifierImport = document.getElementById('item-menu-identifier-import');
        const itemCitationsImport = document.getElementById('item-menu-citations-import');
        const itemFileExport = document.getElementById('item-menu-file-export');
        const itemCrociExport = document.getElementById('item-menu-croci-export');

        itemWikidataSync.disabled = !sourceQid;
        itemFetchCitationQIDs.disabled = !hasCitations;
        itemCrossrefGet.disabled = !sourceDoi;
        itemOccGet.disabled = !sourceOcc;
        itemPdfExtract.disabled = !hasAttachments;
        itemCitationsImport.disabled = false;
        itemFileExport.disabled = !hasCitations;
        itemIdentifierImport.disabled = false;
        itemCrociExport.disabled = !hasCitations;
    },

    handleCitationPopupShowing: function(doc) {
        debug(`Showing citation popup for citation #${this._citationIndex}`);

        const sourceItem = this._sourceItem;
        const citation = sourceItem.citations[this._citationIndex];
        const targetItem = citation.target;

        const ociSuppliers = citation.ocis.map((oci) => oci.supplier);

        doc.getElementById('citation-menu-wikidata-sync').disabled = !sourceItem.qid || !targetItem.qid;
        doc.getElementById('citation-menu-fetch-qid').disabled = false;
        doc.getElementById('citation-menu-file-export').disabled = false;
        doc.getElementById('citation-menu-croci-export').disabled = !sourceItem.doi || !targetItem.doi;
        doc.getElementById('citation-menu-oci-crossref').disabled = !ociSuppliers.includes('crossref');
        doc.getElementById('citation-menu-oci-occ').disabled = !ociSuppliers.includes('occ');
        doc.getElementById('citation-menu-oci-wikidata').disabled = !ociSuppliers.includes('wikidata');
    },

    /**
     * Set an explicit height on the citations list
     *
     * Revisit when Zotero is all HTML.
     */
    updateCitationsBoxSize: function(document) {
        // Based on ZoteroPane.updateTagsBoxSize()
        // check whether we're in the library or PDF Reader
        let citationBoxParent;
        const selectedTab = Zotero_Tabs._tabs[Zotero_Tabs.selectedIndex];
        if (selectedTab.type == "library"){
            citationBoxParent = document.getElementById('zotero-item-pane-content')
        }
        else if (selectedTab.type == "reader"){
            citationBoxParent = document.getElementById(`${selectedTab.id}-context`)
        }

        var pane = document.querySelector('#zotero-item-pane');
        var header = citationBoxParent.querySelector('.citations-box-header');
        var list = citationBoxParent.querySelector('.citations-box-list');
        var footer = citationBoxParent.querySelector('.citations-box-footer');
        if (pane && header && list && footer) {
            let height =
                pane.getBoundingClientRect().height -
                header.getBoundingClientRect().height -
                footer.getBoundingClientRect().height -
                50; // a little padding
            list.style.height = height + 'px';
        }
    },

    /******************************************/
    // Item menu functions
    /******************************************/
    // Create XUL for Zotero menu elements
    zoteroPopup: function(menuName, doc) {
        var zoteroMenu = doc.getElementById(`zotero-${menuName}menu`);
        if (zoteroMenu === null) {
            // Don't do anything if elements not loaded yet
            return;
        }

        var wikiciteSeparator = doc.createElement('menuseparator');
        var wikiciteSeparatorID = `wikicite-${menuName}submenu-separator`;
        wikiciteSeparator.setAttribute('id', wikiciteSeparatorID);
        zoteroMenu.appendChild(wikiciteSeparator);
        WikiciteChrome.registerXUL(wikiciteSeparatorID, doc);

        // Wikicite submenu
        var wikiciteSubmenu = doc.createElement('menu');
        var wikiciteSubmenuID = `wikicite-${menuName}submenu`;
        wikiciteSubmenu.setAttribute('id', wikiciteSubmenuID);
        wikiciteSubmenu.setAttribute(
            'label',
            Wikicite.getString(`wikicite.submenu.label`)
        )
        zoteroMenu.appendChild(wikiciteSubmenu);
        WikiciteChrome.registerXUL(wikiciteSubmenuID, doc);

        // Wikicite submenu popup
        var wikiciteSubmenuPopup = doc.createElement('menupopup');
        wikiciteSubmenuPopup.setAttribute('id', `wikicite-${menuName}submenu-popup`);
        wikiciteSubmenu.appendChild(wikiciteSubmenuPopup);

        this.createMenuItems(
            menuName,
            wikiciteSubmenuPopup,
            `wikicite-${menuName}submenu-`,
            false,
            doc
        );

        this.refreshZoteroPopup(menuName, doc);
    },

    refreshZoteroPopup: function(menuName, doc) {
        let showSubmenu = true;

        if (menuName === 'collection') {
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

        if (menuName === 'item') {
            const items = ZoteroPane.getSelectedItems();
            // Show item submenu for regular items only
            if (!items.some((item) => item.isRegularItem())) {
                showSubmenu = false;
            }
            // Disable "Show local citation network" if only one item is selected
            if (items.length > 1) {
                // For some reason it only works with setAttribute()
                doc.getElementById('wikicite-itemsubmenu-localCitationNetwork').setAttribute(
                    'disabled', false
                );
            } else {
                doc.getElementById('wikicite-itemsubmenu-localCitationNetwork').setAttribute(
                    'disabled', true
                );
            }
        }

        doc.getElementById(`wikicite-${menuName}submenu-separator`).hidden = !showSubmenu;
        doc.getElementById(`wikicite-${menuName}submenu`).hidden = !showSubmenu;
    },

    // Create Zotero item menu items as children of menuPopup
    createMenuItems: function(menuName, menuPopup, IDPrefix, elementsAreRoot, doc) {
        const menuFunctions = [
            'fetchQIDs',
            'fetchOpenAccessUrls',
            'syncWithWikidata',
            'getFromCrossref',
            'getFromOCC',
            'getFromAttachments',
            'addAsCitations',
            'localCitationNetwork'
        ]
        for (const functionName of menuFunctions) {
            if (menuName === 'collection' && functionName === 'addAsCitations') {
                // Fixme: find better way to decide what actions belong to which menu
                // Also consider merging zotero-item, zotero-collection, and wikicite-item
                // menus
                continue;
            }
            const menuFunc = this.zoteroMenuItem(menuName, functionName, IDPrefix, doc);
            menuPopup.appendChild(menuFunc);
            if (elementsAreRoot) {
                WikiciteChrome.registerXUL(menuFunc.id, doc);
            }
        }
    },

    // Create Zotero item menu item
    zoteroMenuItem: function(menuName, functionName, IDPrefix, doc) {
        var menuFunc = doc.createElement('menuitem');
        menuFunc.setAttribute('id', IDPrefix + functionName);
        menuFunc.setAttribute(
            'label',
            Wikicite.getString(`wikicite.submenu.${functionName}`)
        )
        menuFunc.addEventListener('command',
            function(event) {
                event.stopPropagation()
                zoteroOverlay[functionName](menuName)
            }, false)
        return menuFunc;
    }

    // /******************************************/
    // // Zotero item selection and sorting
    // /******************************************/

};

export default zoteroOverlay;
