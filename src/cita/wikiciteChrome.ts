/******************************************/
// Initialization
/******************************************/
// Array holding all root XUL elements (those whose parents are not Wikicite

import { MenuitemOptions } from "zotero-plugin-toolkit";

// elements).
class WikiciteChrome {
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

	static createXULMenuPopup = function (
		doc: Document,
		menuPopupID: string,
		menuItems?: MenuitemOptions[],
	) {
		const _ztoolkit = addon.data.ztoolkit;
		const menuPopup = _ztoolkit.UI.createElement(doc, "menupopup", {
			id: menuPopupID,
		});

		if (menuItems) {
			for (const menuItemDetails of menuItems) {
				_ztoolkit.Menu.register(menuPopup, menuItemDetails);
			}
		}
		return menuPopup;
	};
}

export default WikiciteChrome;
