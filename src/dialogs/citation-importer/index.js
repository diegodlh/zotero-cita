import CitationImporter from './CitationImporter';
import FilePicker from 'zotero@zotero/filePicker';
import React from 'react';
import ReactDOM from 'react-dom';

/* global Components */
/* global document, window */

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
