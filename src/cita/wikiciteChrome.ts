/******************************************/
// Initialization
/******************************************/
// Array holding all root XUL elements (those whose parents are not Wikicite
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
		menuItems?: {
			attributes?: { [id: string]: string };
			listeners?: { [id: string]: (event: Event) => any };
			isDisabled?: (event: Event) => boolean;
			isHidden?: (event: Event) => boolean;
		}[],
	) {
		const _ztoolkit = addon.data.ztoolkit;
		const menuPopup = _ztoolkit.UI.createElement(doc, "menupopup", {
			id: menuPopupID,
		});

		if (menuItems) {
			for (const menuItemDetails of menuItems) {
				const menuItem = _ztoolkit.UI.createElement(doc, "menuitem", {
					attributes: menuItemDetails.attributes,
					listeners:
						menuItemDetails.listeners &&
						Object.entries(menuItemDetails.listeners).map(
							([type, listener]) => {
								return {
									type: type,
									listener: listener,
								};
							},
						),
				});
				if (menuItemDetails.isDisabled) {
					menuPopup.addEventListener("popupshowing", (ev: Event) => {
						const disabled = menuItemDetails.isDisabled!(ev);
						menuItem.disabled = disabled;
					});
				}
				if (menuItemDetails.isHidden) {
					menuPopup.addEventListener("popupshowing", (ev: Event) => {
						const hidden = menuItemDetails.isHidden!(ev);
						menuItem.hidden = hidden;
					});
				}
				menuPopup.appendChild(menuItem);
			}
		}
		return menuPopup;
	};
}

export default WikiciteChrome;
