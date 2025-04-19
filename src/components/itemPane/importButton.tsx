import * as React from "react";
import { Citation } from "../../cita/citation";
import Wikicite from "../../cita/wikicite";
import ToolbarButton from "./toolbarButton";
import PID from "../../cita/PID";
import Lookup from "../../cita/zotLookup";

interface ImportButtonProps {
	citation: Citation;
}

function ImportButton(props: ImportButtonProps) {
	const citation = props.citation as Citation;
	const key = citation.target.key;
	const hasIdentifier = !!citation.target.getBestPID(
		Lookup.pidsSupportedForImport,
	);

	async function handleClick() {
		if (key) return; // Item was already linked and is therefore already present

		const libraryID = citation.source.item.libraryID;
		const collections = Zotero.Collections.getByLibrary(
			libraryID,
			true,
		).map((c) => {
			return { name: c.name, id: c.id };
		});
		collections.unshift({
			name: Zotero.Libraries.getName(libraryID),
			id: NaN,
		});

		// Select collection
		const selected: { value: number } = { value: 0 };
		let selectedCollectionID: number;
		if (collections && collections.length > 1) {
			const result = Services.prompt.select(
				window as mozIDOMWindowProxy,
				"Add to collection",
				"Select a collection to which to add the item or cancel",
				collections.map((c) => c.name),
				selected,
			);

			if (result) selectedCollectionID = collections[selected.value].id;
			else return; // User cancelled the action
		} else selectedCollectionID = NaN; // No collections to choose from

		// Import with Zotero's lookup
		const identifier = citation.target.getBestPID(
			Lookup.pidsSupportedForImport,
		);
		if (identifier) {
			// Import from identifier
			const newItem = (
				await Lookup.lookupIdentifiers(
					[identifier],
					libraryID,
					selectedCollectionID ? [selectedCollectionID] : [],
				)
			)[0];
			if (newItem) {
				for (const pid of citation.target.getAllPIDs()) {
					Wikicite.setExtraField(newItem, pid.type, [pid.id]);
				}
				citation.linkToZoteroItem(newItem);
			} else {
				await citation.autoLink();
			}
		} else {
			// There is no identifier but we do have a JSON item
			const library = Zotero.Libraries.get(libraryID);
			if (library) {
				const newItem =
					await citation.target.item.moveToLibrary(libraryID);
				if (selectedCollectionID)
					newItem.addToCollection(selectedCollectionID);
				citation.linkToZoteroItem(newItem);
			}
		}
	}

	const title = hasIdentifier ? "Import with identifier" : "Import data";
	const icon = hasIdentifier ? "magic-wand" : "add-item";

	return (
		!key && (
			<ToolbarButton
				className="zotero-clicky show-on-hover no-display"
				tabIndex={0}
				onClick={handleClick}
				title={title}
				imgSrc={`chrome://zotero/skin/20/universal/${icon}.svg`}
			/>
		)
	);
}

export default ImportButton;
