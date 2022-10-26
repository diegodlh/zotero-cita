import Wikicite from './wikicite';

/* global window, Components, Services */
/* global AddonManager */

Components.utils.import('resource://gre/modules/AddonManager.jsm');

// Fixme: change to a Class
const WikiciteChrome = {};

/******************************************/
// Initialization
/******************************************/
// Array holding all root XUL elements (those whose parents are not Wikicite
// elements).
WikiciteChrome.XULRootElements = [];

WikiciteChrome.init = function() {
    window.setTimeout(function() {
            if (typeof WikiciteChrome != 'undefined') {
                WikiciteChrome.showUpgradeMessage();
            }
        }, 500);
};

WikiciteChrome.showUpgradeMessage = function() {
};

/******************************************/
// UI functions
/******************************************/

// Open Wikicite preferences window
WikiciteChrome.openPreferences = function() {
    if (!('_preferencesWindow' in this) || this._preferencesWindow === null ||
        this._preferencesWindow.closed) {
        var featureStr = 'chrome, titlebar, toolbar=yes, centerscreen, ';
        var modalStr = Services.prefs.
            getBoolPref('browser.preferences.instantApply')?
            'dialog=no' : 'modal';
        featureStr = featureStr + modalStr;

        this._preferencesWindow =
            window.openDialog(
                'chrome://cita/content/preferences.xul',
                'wikicite-prefs-window',
                featureStr,
                { Wikicite: Wikicite, Prefs: window.Wikicite.Prefs }
            );
    }

    this._preferencesWindow.focus();
};

/******************************************/
// XUL related functions
/******************************************/

// Track XUL elements with ids elementIDs that were added to document doc, so
// that they may be removed on shutdown
WikiciteChrome.registerXUL = function(elementIDs, doc) {
    if (typeof doc.WikiciteXULRootElements == 'undefined') {
        doc.WikiciteXULRootElements = [];
    }

    var xulRootElements;
    if (doc == document) {
        xulRootElements = WikiciteChrome.XULRootElements;
    } else {
        xulRootElements = doc.WikiciteXULRootElements;
    }

    xulRootElements.push(elementIDs);
};

// Remove all root XUL elements from main document and any Zotero tab documents
WikiciteChrome.removeXUL = function() {
    this.removeDocumentXUL(document, this.XULRootElements);
};

WikiciteChrome.removeDocumentXUL = function(doc, XULRootElementIDs) {
    while (XULRootElementIDs.length > 0) {
        var elem = doc.getElementById(XULRootElementIDs.pop());

        if (elem) {
            elem.parentNode.removeChild(elem);
        }
    }
};

export default WikiciteChrome;
