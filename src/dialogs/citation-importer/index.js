import CitationImporter from './CitationImporter';
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
	retVals.didImport = false;
	window.close()
}

async function onImportFile() {
	// todo: update with zotero/filePicker - discussion about this here: https://groups.google.com/g/zotero-dev/c/a1IPUJ2m_3s
	const nsIFilePicker = Components.interfaces.nsIFilePicker;

	const filePicker = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

	filePicker.init(window, Wikicite.getString("wikicite.citation-importer.file-picker.title"), nsIFilePicker.modeOpen);
	filePicker.appendFilters(nsIFilePicker.filterAll);

	// wrap filePicker.open(callback) in a Promise so we can await it
	const filePickerShow = () => new Promise(
		(resolve) => {
			filePicker.open((response) => {
				resolve(response);
			});
		}
	);
	const filePickerReturn = await filePickerShow();

	if (filePickerReturn == nsIFilePicker.returnOK || filePickerReturn == nsIFilePicker.returnReplace) {
		retVals.didImport = true;
		retVals.importedText = false;
		retVals.file = filePicker.file.path;
	}
	else {
		// failing to load the file will close the menu as if `cancel` were clicked
		// perhaps this should produce an error?
		retVals.didImport = false;
	}
	window.close();
}

function onImportText() {
	retVals.didImport = true;
	retVals.importedText = true;
	retVals.text = document.getElementById('citation-input').value;
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
