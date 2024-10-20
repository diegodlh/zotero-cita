// import Wikicite from "./wikicite";

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

	static createXULMenuPopup = function (
		doc: Document,
		menuPopupID: string,
		menuPopupAttributes?: { [id: string]: string },
		menuPopupListeners?: { [id: string]: (event: Event) => any },
		menuItems?: {
			attributes?: { [id: string]: string };
			listeners?: { [id: string]: (event: Event) => any };
		}[],
	) {
		const menuPopup = doc.createXULElement("menupopup");
		menuPopup.setAttribute("id", menuPopupID);
		for (const attribute in menuPopupAttributes) {
			menuPopup.setAttribute(attribute, menuPopupAttributes[attribute]);
		}
		for (const listener in menuPopupListeners) {
			menuPopup.addEventListener(listener, menuPopupListeners[listener]);
		}
		if (menuItems) {
			for (const menuItemDetails of menuItems) {
				const menuItem = doc.createXULElement("menuitem");
				for (const attribute in menuItemDetails["attributes"]) {
					menuItem.setAttribute(
						attribute,
						menuItemDetails["attributes"][attribute],
					);
				}
				for (const listener in menuItemDetails["listeners"]) {
					menuItem.addEventListener(
						listener,
						menuItemDetails["listeners"][listener],
					);
				}
				menuPopup.appendChild(menuItem);
			}
		}
		WikiciteChrome.registerXUL(menuPopupID, doc);
		return menuPopup;
	};
}

export default WikiciteChrome;
