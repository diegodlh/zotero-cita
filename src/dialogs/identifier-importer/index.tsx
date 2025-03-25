import IdentifierImporter from "./IdentifierImporter";
import React from "react";
import ReactDOM from "react-dom";

declare const Components: any;

// import Services into the new window
Components.utils.import("resource://gre/modules/Services.jsm");

const { Wikicite } = window.arguments[0];
const retVals = window.arguments[1];

function onCancel() {
	window.close();
}

function onImport() {
	retVals.text = (
		document.getElementById("identifier-input") as HTMLInputElement
	).value;
	window.close();
}

window.addEventListener("load", () => {
	document.title = Wikicite.getString("wikicite.identifier-importer.title");
	ReactDOM.render(
		<IdentifierImporter
			getString={(name) => Wikicite.getString(name)}
			onCancel={onCancel}
			onImport={onImport}
		/>,
		document.getElementById("root"),
	);
});
