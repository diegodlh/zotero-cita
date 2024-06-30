// import Wikicite from "./wikicite";

declare const Services: any;
declare global {
	interface Document {
		WikiciteXULRootElements: string[];
	}
}

/******************************************/
// Initialization
/******************************************/
// Array holding all root XUL elements (those whose parents are not Wikicite
// elements).
class WikiciteChrome {
	static XULRootElements: string[] = [];

	static init = function () {
		window.setTimeout(function () {
			if (typeof WikiciteChrome != "undefined") {
				WikiciteChrome.showUpgradeMessage();
			}
		}, 500);
	};

	static showUpgradeMessage = function () {};

	/******************************************/
	// UI functions
	/******************************************/

	// Fix: did changing this to a class break this scoping here?
	// Open Wikicite preferences window
	static openPreferences = function () {
		// if (
		// 	!("_preferencesWindow" in this) ||
		// 	this._preferencesWindow === null ||
		// 	this._preferencesWindow.closed
		// ) {
		// 	var featureStr = "chrome, titlebar, toolbar=yes, centerscreen, ";
		// 	var modalStr = Services.prefs.getBoolPref(
		// 		"browser.preferences.instantApply",
		// 	)
		// 		? "dialog=no"
		// 		: "modal";
		// 	featureStr = featureStr + modalStr;
		// 	this._preferencesWindow = window.openDialog(
		// 		"chrome://cita/content/preferences.xul",
		// 		"wikicite-prefs-window",
		// 		featureStr,
		// 		{ Wikicite: Wikicite, Prefs: window.Wikicite.Prefs },
		// 	);
		// }
		// this._preferencesWindow.focus();
	};

	/******************************************/
	// XUL related functions
	/******************************************/

	// Track XUL elements with ids elementIDs that were added to document doc, so
	// that they may be removed on shutdown
	static registerXUL = function (elementIDs: string, doc: Document) {
		if (typeof doc.WikiciteXULRootElements == "undefined") {
			doc.WikiciteXULRootElements = [];
		}

		let xulRootElements: string[];
		if (doc == document) {
			xulRootElements = WikiciteChrome.XULRootElements;
		} else {
			xulRootElements = doc.WikiciteXULRootElements;
		}

		xulRootElements.push(elementIDs);
	};

	// Remove all root XUL elements from main document and any Zotero tab documents
	static removeXUL = function () {
		WikiciteChrome.removeDocumentXUL(
			document,
			WikiciteChrome.XULRootElements,
		);
	};

	static removeDocumentXUL = function (
		doc: Document,
		XULRootElementIDs: string[],
	) {
		while (XULRootElementIDs.length > 0) {
			const elemId = XULRootElementIDs.pop();
			if (elemId) {
				const elem = doc.getElementById(elemId);

				elem?.parentNode?.removeChild(elem);
			}
		}
	};
}

export default WikiciteChrome;
