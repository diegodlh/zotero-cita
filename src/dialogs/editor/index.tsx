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
const retVals: { item: Zotero.Item } = (window as any).arguments[1];

citation = citation as Citation;

let newItem: ItemWrapper;

function onCancel() {
	retVals.item = false;
	window.close();
}

function onSave() {
	for (const pidType of newItem.getPIDTypes()) {
		const pid = newItem.getPID(pidType);
		if (pid == undefined || !checkPID(pidType, pid)) {
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

	// remove the collapsible section:
	// item box contains
	// <collapsible section>
	//     <head/>
	//     <body/>
	// </collapsible section>
	// we want to replace the collapsible section with its body
	const itemBox = document.getElementById("citation-editor-item-box")!;
	// const collapsibleSection = itemBox.firstChild!;
	// itemBox.firstChild!.replaceWith(itemBox.firstChild!.lastChild!);
	// win.replaceChild(itemBox, itemBoxWrapper);
	// itemBox.firstChild!.replaceWith(itemBox.firstChild!.lastChild!);
	// just hide the head of the collapsible section
	// (collapsibleSection as any).toggleAttribute("open", false);
	// (collapsibleSection as any).toggleAttribute("open", true);

	(itemBox.firstChild!.firstChild! as HTMLElement).hidden = true;

	// itemBox.removeCreator is calling itemBox.item.saveTx
	// even if itemBox.saveOnEdit is set to false;
	// overwrite saveTx as workaround
	newItem.item.saveTx = () => (itemBox as any).refresh();
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
	// itemBox.firstChild!.replaceWith(itemBox.firstChild!.lastChild!);
	// alert("opening");
	// (collapsibleSection as any).toggleAttribute("open", false);
	// (collapsibleSection as any).toggleAttribute("open", true);
	// (collapsibleSection as any).open = true;
	// alert("opened");
	// alert("rendered1");
});
