import IdentifierImporter from "./IdentifierImporter";
import * as React from "react";
import { createRoot } from "react-dom/client";

const { Wikicite } = (window as any).arguments[0];
const retVals: { text?: string } = (window as any).arguments[1];

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
	const root = createRoot(document.getElementById("root")!);
	root.render(
		<IdentifierImporter
			getString={(name) => Wikicite.getString(name)}
			onCancel={onCancel}
			onImport={onImport}
		/>,
	);
});
