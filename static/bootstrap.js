"use strict";

/* global Components, Services */
/* global APP_SHUTDOWN */
Components.utils.import("resource://gre/modules/Services.jsm");

const PREF_BRANCH = 'extensions.cita.';

const styleSheets = [
  'chrome://cita/skin/overlay.css'
];

// eslint-disable-next-line no-unused-vars
function install(data, reason) {

}

// eslint-disable-next-line no-unused-vars
function startup(data, reason) {
  Wikicite.init();
}

// eslint-disable-next-line no-unused-vars
function shutdown(data, reason) {
  if (reason == APP_SHUTDOWN) {
    return;
  }

  const windows = Services.wm.getEnumerator('navigator:browser');
  while (windows.hasMoreElements()) {
    const tmpWin=windows.getNext();

    tmpWin.WikiciteChrome.removeXUL();
    if (typeof tmpWin.WikiciteChrome.zoteroOverlay != 'undefined') {
      tmpWin.WikiciteChrome.zoteroOverlay.unload();
    }
    delete tmpWin.WikiciteChrome;
    delete tmpWin.Wikicite;
  }

  Wikicite.cleanup();

  Services.strings.flushBundles();
}

// eslint-disable-next-line no-unused-vars
function uninstall(data, reason) {

}

const Wikicite = {
  /********************************************/
  // Wikicite setup functions
  /********************************************/
  init: function() {
    // Register observers that will respond to notifications triggered by preference changes
    // this.observers.register()

    // Set default preferences and watch changes
    this.Prefs.init()

    // Watch Zotero preferences
    // Wikicite.ZoteroPrefs.init()

    this.prepareWindows()

    // Fixme: Not sure whether this belongs here or into loadWindowChrome
    // https://developer.mozilla.org/en-US/docs/Archive/Add-ons/How_to_convert_an_overlay_extension_to_restartless
    let styleSheetService= Components.classes["@mozilla.org/content/style-sheet-service;1"]
      .getService(Components.interfaces.nsIStyleSheetService);
    for (let i=0, len=styleSheets.length;i<len;i++) {
      let styleSheetURI = Services.io.newURI(styleSheets[i], null, null);
      styleSheetService.loadAndRegisterSheet(styleSheetURI, styleSheetService.AUTHOR_SHEET);
    }
  },

  cleanup: function() {
    // this.Prefs.unregister();
    // this.observers.unregister();
    Services.wm.removeListener(this.windowListener);

    // Unload stylesheets
    let styleSheetService = Components.classes["@mozilla.org/content/style-sheet-service;1"]
      .getService(Components.interfaces.nsIStyleSheetService);
    for (let i=0, len=styleSheets.length; i<len; i++) {
      let styleSheetURI = Services.io.newURI(styleSheets[i], null, null);
      if (styleSheetService.sheetRegistered(styleSheetURI, styleSheetService.AUTHOR_SHEET)) {
        styleSheetService.unregisterSheet(styleSheetURI, styleSheetService.AUTHOR_SHEET);
      }
    }
  },

  prepareWindows: function() {
    // Load scripts for previously opened windows
    const windows = Services.wm.getEnumerator('navigator:browser');
    while (windows.hasMoreElements()) {
      this.loadWindowChrome(windows.getNext());
    }

    // Add listener to load scripts in windows opened in the future
    Services.wm.addListener(this.windowListener);
  },

  // Why does wm.addListener's listener object's onOpenWindow method
  // expect a xulWindow that I have to convert to a domWindow,
  // whereas wm.getEnumerator returns domWindows (or at least windows
  // I can provide directly to loadWindowChrome?
  windowListener: {
    onOpenWindow: function(xulWindow) {
      // Wait for the window to finish loading
      var domWindow = xulWindow
        .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIDOMWindow)

      domWindow.addEventListener('load', function listener() {
        domWindow.removeEventListener('load', listener, false)
        if (domWindow.document.documentElement.getAttribute('windowtype') == 'navigator:browser') {
          Wikicite.loadWindowChrome(domWindow);
        }
      }, false)
    },
    onCloseWindow: function(_xulWindow) {},
    onWindowTitleChange: function(_xulWindow, _newTitle) {}
  },

  loadWindowChrome: function(scope) {
    scope.Wikicite = {};

    // If needed, I may make the `window` property `Wikicite` point to some
    // window-independent properties or methods defined here, such as Prefs.
    // Prefs are initialized here, in bootstrap, so I need them defined here,
    // but I may also need them in the window (and I can't import them there).
    scope.Wikicite.Prefs = this.Prefs;

    // Define WikiciteChrome as window property so it can be deleted on
    // shutdown
    scope.WikiciteChrome = {};
    Services.scriptloader.loadSubScript(
      'chrome://cita/content/main.js', scope);
    scope.WikiciteChrome.zoteroOverlay.init();
  }
}

Wikicite.Prefs = {
  init: function() {
    this.prefBranch = Services.prefs.getBranch(PREF_BRANCH);
    this.setDefaults()

    // Register observer to handle pref changes
    this.register()
  },

  setDefaults: function() {
    const defaults = Services.prefs.getDefaultBranch(PREF_BRANCH);
    // defaults.setIntPref(prefName, prefValue);
    defaults.setCharPref('sortBy', 'ordinal');  // 'ordinal', 'authors', 'title', 'date'
    defaults.setCharPref('storage', 'note');  // 'extra' || 'note'
    // defaults.setBoolPref();
  },

  get: function(pref, global) {
    let prefVal;
    try {
      let branch;
      if (global) {
        branch = Services.prefs.getBranch('');
      } else {
        branch = this.prefBranch;
      }

      switch (branch.getPrefType(pref)){
        case branch.PREF_BOOL:
          prefVal = branch.getBoolPref(pref);
          break;
        case branch.PREF_STRING:
          prefVal = branch.getCharPref(pref);
          break;
        case branch.PREF_INT:
          prefVal = branch.getIntPref(pref);
          break;
      }
    }
    catch (e) {
      throw new Error('Invalid Cita pref call for ' + pref);
    }

    return prefVal;
  },

  set: function(pref, value) {
    switch (this.prefBranch.getPrefType(pref)){
      case this.prefBranch.PREF_BOOL:
        return this.prefBranch.setBoolPref(pref, value);
      case this.prefBranch.PREF_STRING:
        return this.prefBranch.setCharPref(pref, value);
      case this.prefBranch.PREF_INT:
        return this.prefBranch.setIntPref(pref, value);
    }

    return false;
  },

  clear: function(pref) {
    try {
      this.prefBranch.clearUserPref(pref);
    }
    catch (e) {
      throw new Error('Invalid preference "' + pref + '"');
    }
  },

  //
  // Methods to register a preferences observer
  //
  register: function() {
    this.prefBranch.addObserver('', this, false);
  },

  unregister: function() {
    if (!this.prefBranch) {
      return;
    }
    this.prefBranch.removeObserver('', this);
  },

  //
  // The observe function that will be called
  // when a preference changes
  //
  observe: function(subject, topic, data) {
    if (topic != 'nsPref:changed') {
      return;
    }
    if (data === 'sortBy') {
      // if the sortBy preference changes, notify observers of the
      // 'wikicite-sortby-update' topic
      Services.obs.notifyObservers(null, 'wikicite-sortby-update', null);
    }
  }
}
