import CitationEditor from "./CitationEditor";
import ItemWrapper from "../../cita/itemWrapper";
import * as React from "react";
import { createRoot } from "react-dom/client";
import Citation from "../../cita/citation";
import Wikicite from "../../cita/wikicite";

let citation: Citation;
({ citation, addon: window.addon } = (window as any).arguments[0]);
const retVals: { item?: Zotero.Item } = (window as any).arguments[1];
let newItem: ItemWrapper;

function onCancel() {
	retVals.item = undefined;
	window.close();
}

function onSave() {
	for (const pidType of newItem.getPIDTypes()) {
		const pid = newItem.getPID(pidType);
		if (pid !== undefined && !checkPID(pidType, pid)) {
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

window.addEventListener("load", () => {
	document.title = Wikicite.getString("wikicite.editor.title");
	newItem = new ItemWrapper();
	newItem.fromJSON(citation.target.toJSON());

	const itemBox = document.getElementById("citation-editor-item-box")!;

	// itemBox.removeCreator is calling itemBox.item.saveTx
	// even if itemBox.saveOnEdit is set to false;
	// overwrite saveTx as workaround
	newItem.item.saveTx = () => (itemBox as any)._forceRenderAll();
	const root = createRoot(document.getElementById("root")!);
	root.render(
		<CitationEditor
			checkCitationPID={checkPID}
			item={newItem}
			itemBox={itemBox}
			getString={(name) => Wikicite.getString(name)}
			onCancel={onCancel}
			onSave={onSave}
		/>,
	);
});
