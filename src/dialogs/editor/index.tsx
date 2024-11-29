import CitationEditor from "./CitationEditor";
import ItemWrapper from "../../cita/itemWrapper";
import * as React from "react";
import { createRoot } from "react-dom/client";
import Citation from "../../cita/citation";
import Wikicite from "../../cita/wikicite";
import { compareSemVer } from "semver-parser";
import ZoteroOverlay from "../../cita/zoteroOverlay";
import WikiciteChrome from "../../cita/wikiciteChrome";
import PID from "../../cita/PID";

let citation: Citation;
({
	citation,
	addon: window.addon,
	ZoteroPane: window.ZoteroPane,
	goUpdateGlobalEditMenuItems:
		window.document.defaultView!.goUpdateGlobalEditMenuItems,
} = (window as any).arguments[0]);
const retVals: { item?: Zotero.Item } = (window as any).arguments[1];
let newItem: ItemWrapper;
let sourceLabel: string;
let sourceType: Zotero.Item.ItemType;

function onCancel() {
	retVals.item = undefined;
	window.close();
}

function onSave() {
	for (const pidType of newItem.validPIDTypes) {
		const pid = newItem.getPID(pidType);
		if (pid !== null && !checkPID(pidType, pid.id)) {
			return;
		}
	}
	retVals.item = newItem.item;
	window.close();
}

function checkPID(type: PIDType, value: string) {
	return citation.source.checkPID(type, value, {
		alert: true,
		parentWindow: window,
		skipCitation: citation,
	});
}

/** Popup menu for adding new PID rows */
// Copied from zoteroOverlay.tsx
function pidRowPopupMenu(
	doc: Document,
	mainWindow: Element,
	sourceItem: ItemWrapper,
) {
	const pidRowMenu = WikiciteChrome.createXULMenuPopup(
		doc,
		"pid-row-add-menu",
		PID.showable.map((pidType) => {
			return {
				attributes: {
					id: `pid-row-add-${pidType}`,
					label: pidType,
				},
				listeners: {
					command: (event: Event) => {
						event.preventDefault();
						document
							.getElementById(`pid-row-${pidType}`)!
							.classList.remove("hidden");
						(
							document.getElementById(
								`pid-row-add-${pidType}`,
							) as unknown as XULMenuItemElement
						).hidden = true;
						if (
							// if all the menu items are hidden (ie. all the rows are shown) - hide the + button
							Array.from(
								document.getElementById("pid-row-add-menu")!
									.children!,
							).every(
								(menuItem) =>
									(menuItem as unknown as XULMenuItemElement)
										.hidden,
							)
						) {
							const addPIDButton =
								document.getElementsByClassName(
									"add-pid", // The "type" of the section button
								)[0] as unknown as XULButtonElement;
							addPIDButton.hidden = true;
							addPIDButton.disabled = true;
						}
					},
				},
				isHidden: () => {
					return (
						!sourceItem!.validPIDTypes.includes(pidType) ||
						!document
							.getElementById(`pid-row-${pidType}`)
							?.classList.contains("hidden")
					);
				},
			};
		}),
	);

	mainWindow.appendChild(pidRowMenu);
}

window.addEventListener("load", () => {
	document.title = Wikicite.getString("wikicite.editor.title");
	newItem = new ItemWrapper();
	newItem.fromJSON(citation.target.toJSON());
	sourceLabel = citation.source.getLabel();
	sourceType = citation.source.item.itemType;

	const container = document.getElementById(
		"citation-editor-item-box-container",
	)!;
	const itemBoxLabel = document.createElement("h4");
	itemBoxLabel.textContent = "Target"; //Wikicite.getString("wikicite.editor.title");
	container.appendChild(itemBoxLabel);
	// "item-box" was renamed to "info-box" in Zotero 7.0.10. We compare to 7.0.9 to include the beta versions.
	const tagName =
		compareSemVer(Zotero.version, "7.0.9") === 1 ? "info-box" : "item-box";
	const itemBox = document.createElementNS(
		"http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
		tagName,
	);
	itemBox.setAttribute("id", "citation-editor-item-box");
	container.appendChild(itemBox);

	// itemBox.removeCreator is calling itemBox.item.saveTx
	// even if itemBox.saveOnEdit is set to false;
	// overwrite saveTx as workaround
	newItem.item.saveTx = () => (itemBox as any)._forceRenderAll();

	// Create "Add PID" menu
	const mainWindow = document.getElementById("citation-editor");
	pidRowPopupMenu(document, mainWindow!, newItem);

	const root = createRoot(document.getElementById("root")!);
	root.render(
		<CitationEditor
			checkCitationPID={checkPID}
			item={newItem}
			sourceLabel={sourceLabel}
			sourceType={sourceType}
			itemBox={itemBox}
			getString={(name) => Wikicite.getString(name)}
			onCancel={onCancel}
			onSave={onSave}
		/>,
	);
});
