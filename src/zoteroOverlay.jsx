import Citations from './citations';
import CitationsBoxContainer from './containers/citationsBoxContainer';
import Crossref from './crossref';
import Extraction from './extract';
import LCN from './localCitationNetwork';
import OpenCitations from './opencitations';
import React from 'react';
import ReactDOM from 'react-dom';
import SourceItemWrapper from './sourceItemWrapper';
import Wikicite from './wikicite';
import WikiciteChrome from './wikiciteChrome';
import Wikidata from './wikidata';

const TRANSLATORS_PATH = 'chrome://cita/content/translators/'
const TRANSLATOR_LABELS = [
    'Wikidata API',
    'Wikidata JSON',
    'Wikidata QuickStatements'
];

/* global window, document, Components, MutationObserver*/
/* global Services */
/* global Zotero, ZoteroPane */
Components.utils.import('resource://zotero/config.js');

// Fixme: Candidate move to Wikicite?
function debug(msg, err) {
    if (err) {
        Zotero.debug(`{Cita} ${new Date} error: ${msg} (${err} ${err.stack})`)
    } else {
        Zotero.debug(`{Cita} ${new Date}: ${msg}`)
    }
}

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
    zoteroOverlay.refreshCitationsPane(document, event.target);
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
        document.getElementById('zotero-items-tree').addEventListener('select', refreshCitationsPane, false);

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
        document.getElementById('zotero-items-tree').removeEventListener('select', refreshCitationsPane, false)

        window.removeEventListener('resize', updateCitationsBoxSize);
        document.getElementById('zotero-items-splitter').removeEventListener('mousemove', updateCitationsBoxSize, false);
        document.getElementById('zotero-items-splitter').removeEventListener('command', updateCitationsBoxSize, false);
        this.switcherObserver.disconnect();

        this.uninstallTranslators();
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
                console.log('Skipping installation of translator ' + label);
                return;
            }
        }
        try {
            await Zotero.Translators.save(metadata, code);
        } catch (err) {
            console.log(`Failed to install translator ${label}: ${err}`);
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
          console.log(`Failed to remove translator ${label}: ${err}`)
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
                } else if (collectionTreeRow.isLibrary()) {
                    const libraryID = ZoteroPane.getSelectedLibraryID();
                    items = await Zotero.Items.getAll(libraryID);
                }
                break;
            }
        }
        items = items.filter((item) => item.isRegularItem());
        if (wrap) items = items.map((item) => new SourceItemWrapper(item));
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

    addAsCitations: function(menuName) {
        // Add items selected as citation target items of one or more source items
        // 1. open selectItemsDialog.xul; allow one or more item selection
        // 2. create citation objects for each of the target items selected
        // 3. for each of the source items selected, wrap it into a SourceItemWrapper
        // 4. run addCitations and pass it the citation objects created above
        // 5. finally, link citations to the Zotero items
        // see #39
        Services.prompt.alert(
            window,
            Wikicite.getString('wikicite.global.unsupported'),
            Wikicite.getString('wikicite.citations.from-items.unsupported')
        );
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

        // Import from BibTeX menu item

        const itemBibTexImport = doc.createElement('menuitem');
        itemBibTexImport.setAttribute('id', 'item-menu-bibtex-import');
        itemBibTexImport.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.import-bibtex')
        );
        itemBibTexImport.addEventListener(
            'command', () => this._sourceItem.getFromBibTeX()
        );

        // Export to BibTeX menu item

        const itemBibTexExport = doc.createElement('menuitem');
        itemBibTexExport.setAttribute('id', 'item-menu-bibtex-export');
        itemBibTexExport.setAttribute(
            'label', Wikicite.getString('wikicite.item-menu.export-bibtext')
        );
        itemBibTexExport.addEventListener(
            'command', () => this._sourceItem.exportToBibTeX()
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
        itemMenu.appendChild(itemCrossrefGet);
        itemMenu.appendChild(itemOccGet);
        itemMenu.appendChild(itemPdfExtract);
        itemMenu.appendChild(itemBibTexImport);
        itemMenu.appendChild(itemBibTexExport);
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

        const itemBibTexExport = doc.createElement('menuitem');
        itemBibTexExport.setAttribute('id', 'citation-menu-bibtex-export');
        itemBibTexExport.setAttribute(
            'label', Wikicite.getString('wikicite.citation-menu.export-bibtex')
        );
        itemBibTexExport.addEventListener(
            'command', () => this._sourceItem.exportToBibTeX(this._citationIndex)
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
        citationMenu.appendChild(itemBibTexExport);
        citationMenu.appendChild(itemCrociExport);
        citationMenu.appendChild(ociMenu);

        mainWindow.appendChild(citationMenu);
        WikiciteChrome.registerXUL(citationMenuID, doc);
    },

    refreshCitationsPane: function(document, target) {
        var selectedItems = ZoteroPane.getSelectedItems()
        if (selectedItems.length == 1) {
            var item = selectedItems[0];
            if (item.isRegularItem()  && !item.isFeedItem) {
                var zoteroViewTabbox = ZoteroPane.document.getElementById('zotero-view-tabbox');
                // fix: should I get any of these references from when they were created above?
                const editPaneTabs = document.getElementById('zotero-editpane-tabs');
                const citationsTabIndex = Array.from(editPaneTabs.children).findIndex(child => child.id === 'zotero-editpane-citations-tab');
                if (zoteroViewTabbox.selectedIndex === citationsTabIndex) {
                    // fix: runs twice when tab is changed to Citations
                    console.log(`Refreshing citations pane... (${target.id})`);
                    const t0 = performance.now();
                    ReactDOM.render(
                        <CitationsBoxContainer
                            //Having the key change, makes the CitationsBoxComntainer
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
                        document.getElementById('citations-box-container'),
                        () => this.updateCitationsBoxSize(document)
                    );
                    const t1 = performance.now();
                    console.log(`Rendering CitationsBoxContainer took ${t1-t0}ms.`);
                }
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
        const itemCrossrefGet = document.getElementById('item-menu-crossref-get');
        const itemOccGet = document.getElementById('item-menu-occ-get');
        const itemPdfExtract = document.getElementById('item-menu-pdf-extract');
        const itemBibTexImport = document.getElementById('item-menu-bibtex-import');
        const itemBibTexExport = document.getElementById('item-menu-bibtex-export');
        const itemCrociExport = document.getElementById('item-menu-croci-export');

        itemWikidataSync.disabled = !sourceQid;
        itemCrossrefGet.disabled = !sourceDoi;
        itemOccGet.disabled = !sourceOcc;
        itemPdfExtract.disabled = !hasAttachments;
        itemBibTexImport.disabled = false;
        itemBibTexExport.disabled = !hasCitations;
        itemCrociExport.disabled = !hasCitations;
    },

    handleCitationPopupShowing: function(doc) {
        console.log(`Showing citation popup for citation #${this._citationIndex}`);

        const sourceItem = this._sourceItem;
        const citation = sourceItem.citations[this._citationIndex];
        const targetItem = citation.target;

        const ociSuppliers = citation.ocis.map((oci) => oci.supplier);

        doc.getElementById('citation-menu-wikidata-sync').disabled = !sourceItem.qid || !targetItem.qid;
        doc.getElementById('item-menu-bibtex-export').disabled = false;
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
        var pane = document.querySelector('#zotero-item-pane');
        var header = document.querySelector('#zotero-item-pane .citations-box-header');
        var list = document.querySelector('#zotero-item-pane .citations-box-list');
        var footer = document.querySelector('#zotero-item-pane .citations-box-footer');
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
                !collectionTreeRow.isLibrary()
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
