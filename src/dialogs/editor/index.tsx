import CitationEditor from "./CitationEditor";
import ItemWrapper from "../../cita/itemWrapper";
import React from "react";
import ReactDOM from "react-dom";

declare const Components: any;

// import Services into the new window
Components.utils.import("resource://gre/modules/Services.jsm");

const { citation, Wikicite } = window.arguments[0];
const retVals = window.arguments[1];

let newItem: any;

function onCancel() {
	retVals.item = false;
	window.close();
}

function onSave() {
	for (const pidType of newItem.getPIDTypes()) {
		const pid = newItem.getPID(pidType);
		if (!checkPID(pidType, pid)) {
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
	// itemBox.removeCreator is calling itemBox.item.saveTx
	// even if itemBox.saveOnEdit is set to false;
	// overwrite saveTx as workaround
	newItem.item.saveTx = () =>
		(document.getElementById("citation-editor-item-box") as any).refresh();
	ReactDOM.render(
		<CitationEditor
			checkCitationPID={checkPID}
			item={newItem}
			itemBox={document.getElementById("citation-editor-item-box")}
			getString={(name) => Wikicite.getString(name)}
			onCancel={onCancel}
			onSave={onSave}
		/>,
		document.getElementById("root"),
	);
});
