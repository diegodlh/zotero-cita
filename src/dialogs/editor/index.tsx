import CitationEditor from "./CitationEditor";
import ItemWrapper from "../../cita/itemWrapper";
import * as React from "react";
import { createRoot } from "react-dom/client";
import Citation from "../../cita/citation";

// const citation: Citation = (window as any).arguments[0][0];
// const Wikicite: any = (window as any).arguments[0][1];
// const retVals: { item: Zotero.Item } = (window as any).arguments[1];

let citation: Citation;
let Wikicite: any;
({ citation, Wikicite } = (window as any).arguments[0]);
const retVals: { item?: Zotero.Item } = (window as any).arguments[1];

citation = citation as Citation;

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

function checkPID(type: string, value: string) {
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
	// newItem.item.saveTx = () => (itemBox as any).refresh();
	newItem.item.saveTx = () => (itemBox as any)._forceRenderAll(); // refresh isn't a function
	const root = createRoot(document.getElementById("root")!);
	root.render(
		<CitationEditor
			checkCitationPID={checkPID}
			item={newItem}
			// itemBox={document.getElementById("citation-editor-item-box")!}
			itemBox={itemBox}
			getString={(name) => Wikicite.getString(name)}
			onCancel={onCancel}
			onSave={onSave}
		/>,
	);
});
