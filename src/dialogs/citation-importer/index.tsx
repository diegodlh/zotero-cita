import CitationImporter from "./CitationImporter";
import * as React from "react";
import { createRoot } from "react-dom/client";
import Wikicite from "../../cita/wikicite";

({ addon: window.addon } = (window as any).arguments[0]);
const retVals: { path?: string; text?: string } = (window as any).arguments[1];

function onCancel() {
	window.close();
}

async function onImportFile() {
	// @ts-ignore see: https://www.zotero.org/support/dev/zotero_7_for_developers#zotero_platform
	const { FilePicker } = ChromeUtils.importESModule(
		"chrome://zotero/content/modules/filePicker.mjs",
	);
	const filePicker = new FilePicker();

	filePicker.init(
		window,
		Wikicite.getString("wikicite.citation-importer.file-picker.title"),
		filePicker.modeOpen,
	);
	filePicker.appendFilters(filePicker.filterAll);

	const filePickerReturn = await filePicker.show();

	if (filePickerReturn == filePicker.returnOK) {
		retVals.path = filePicker.file;
		// failing to load the file will close the menu as if `cancel` were clicked
		// perhaps this should produce an error?
	}
	window.close();
}

function onImportText(text: string) {
	retVals.text = text;
	window.close();
}

window.addEventListener("load", () => {
	document.title = Wikicite.getString("wikicite.citation-importer.title");
	const root = createRoot(document.getElementById("root")!);
	root.render(
		<CitationImporter
			getString={(name) => Wikicite.getString(name)}
			onCancel={onCancel}
			onImportFile={onImportFile}
			onImportText={onImportText}
		/>,
	);
});
