import CitationEditor from "./CitationEditor";
import ItemWrapper from "../../cita/itemWrapper";
import * as React from "react";
import { createRoot } from "react-dom/client";
import Citation from "../../cita/citation";
import Wikicite from "../../cita/wikicite";
import { compareSemVer } from "semver-parser";
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
let _shownPIDs: Set<PIDType>;
let pidChangeCallback: ((pidTypes: Set<PIDType>) => void) | undefined;

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
		[...PID.showable].map((pidType) => {
			return {
				tag: "menuitem",
				id: `pid-row-add-${pidType}`,
				label: pidType,
				commandListener: (event: Event) => {
					event.preventDefault();
					showPID(pidType);
				},
				isHidden: () => {
					// If the PID row is already shown or the source item doesn't support it, hide the menu item
					return (
						_shownPIDs.has(pidType) ||
						!sourceItem!.validPIDTypes.has(pidType)
					);
				},
			};
		}),
	);

	mainWindow.appendChild(pidRowMenu);
}

// Used only to sync the state from React to the overlay
function setShownPIDs(pidTypes: Set<PIDType>) {
	_shownPIDs = pidTypes;
}

function showPID(pidType: PIDType) {
	const newSet = _shownPIDs;
	newSet.add(pidType);

	// We do this in a roundabout way to preserve the order of the PID rows (because the sets are actually ordered)
	_shownPIDs = PID.showable.difference(PID.showable.difference(newSet));
	notifyPIDChanges();
}

// Method to register a callback for PID changes
function onPIDChange(callback?: (pidTypes: Set<PIDType>) => void) {
	pidChangeCallback = callback;
}

function notifyPIDChanges() {
	if (pidChangeCallback) {
		pidChangeCallback(_shownPIDs);
	}
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
	// "item-box" was renamed to "info-box" in Zotero 7.0.10, so check if we have at least this version of Zotero.
	let semVerCompare: number;
	try {
		semVerCompare = compareSemVer(Zotero.version, "7.0.10");
	} catch (e) {
		// Zotero.version is not a valid semver string
		// This may happen when installing certain beta versions or building Zotero from source, so we treat it as if it is at least Zotero 7.0.10
		Zotero.log(
			`Zotero version (${Zotero.version}) is not a valid semver string - maybe you installed a beta version or built it from source? Treating this version of Zotero as at least 7.0.10.`,
		);
		semVerCompare = 1;
	}
	const tagName = semVerCompare === 1 ? "info-box" : "item-box";
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
			editorOnPIDChange={onPIDChange}
			editorSetShownPIDs={setShownPIDs}
		/>,
	);
});
