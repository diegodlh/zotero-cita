import CitationImporter from './CitationImporter';
import React from 'react';
import ReactDOM from 'react-dom';

declare const Components: any;

// import Services into the new window
Components.utils.import("resource://gre/modules/Services.jsm");

const {
	Wikicite
} = window.arguments[0];
const retVals = window.arguments[1];

function onCancel() {
	window.close()
}

async function onImportFile() {
	let FilePicker;
	try {
		FilePicker = await import('zotero@zotero/filePicker').then((mod) => mod.default);
	} catch {
		// support Zotero af597d9
		FilePicker = await import('zotero@zotero/modules/filePicker').then((mod) => mod.default);
	}
	const filePicker = new FilePicker();

	filePicker.init(
		window,
		Wikicite.getString("wikicite.citation-importer.file-picker.title"),
		filePicker.modeOpen
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

function onImportText(text) {
	retVals.text = text;
	window.close();
}

window.addEventListener("load", () => {
	document.title = Wikicite.getString('wikicite.citation-importer.title');
	ReactDOM.render(
		<CitationImporter
			getString={(name) => Wikicite.getString(name)}
			onCancel={onCancel}
			onImportFile={onImportFile}
			onImportText={onImportText}
		/>,
		document.getElementById('root')
	);
});
