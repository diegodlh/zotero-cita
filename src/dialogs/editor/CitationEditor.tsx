import PIDRow from "../../components/pidRow";
import * as React from "react";
import { useEffect, useState } from "react";
import ItemWrapper from "../../cita/itemWrapper";

const visibleBaseFieldNames = ["title", "publicationTitle", "date"];

interface CitationEditorProps {
	checkCitationPID: (type: PIDType, value: string) => boolean;
	item: ItemWrapper;
	itemBox: any;
	getString: (name: string) => string;
	onCancel: () => void;
	onSave: () => void;
	onRefresh: () => void;
}

// Fixme: as a Citation Editor (not a target item editor)
// consider providing at least some read only information about the citation
// such as label of the source item, OCIs, and Zotero link status
const CitationEditor = (props: CitationEditorProps) => {
	const [pidTypes, setPidTypes] = useState(props.item.getPIDTypes());

	useEffect(() => {
		// const addCreatorRow = props.itemBox.addCreatorRow.bind(props.itemBox);
		// props.itemBox.addCreatorRow = function(creatorData, creatorTypeIDOrName, unsaved, defaultRow) {
		//     addCreatorRow(creatorData, creatorTypeIDOrName, false, defaultRow)
		// };

		// props.itemBox.disableCreatorAddButtons = () => {};

		// props.itemBox.blurOpenField = () => {};

		// if item's saveTx overwritten with itembox.refresh,
		// sometimes itembox gets stucked in a loop
		// overwrite _focusNextField as a workaround
		try {
			props.itemBox._focusNextField = () => {};

			// const disableButton = props.itemBox.disableButton.bind(props.itemBox);
			// props.itemBox.disableButton = function(button) {
			//     if (
			//         button.value === '+' &&
			//         this._dynamicFields.getElementsByAttribute('value', '+').length === 1
			//     ) return;
			//     disableButton(button);
			// }
			props.itemBox.mode = "edit";

			// itembox sometimes fails to update if saveOnEdit is set to false
			// make sure item's saveTx is overwritten to prevent actual item saving
			props.itemBox.saveOnEdit = true;
			setHiddenFields(props.item.item.itemTypeID);
			props.itemBox.item = props.item.item;

			// props.itemBox.item.saveTx = function() {
			//     if (!props.itemBox.item._refreshed) {
			//         props.itemBox.refresh();
			//     }
			// }
			props.itemBox.addHandler("itemtypechange", onItemTypeChange);

			// todo: this is a weird hack to get the item box to appear
			// but not to change the state of the item box in the main Zotero pane
			// changing .open changes the item pane item box
			// but using toggleAttribute doesn't
			// but toggleAttribute doesn't work until open has been manually set to true
			// so set to false, then true, the back to what it was, then toggle it to open
			const originalOpenState = props.itemBox.open;
			props.itemBox.open = false;
			props.itemBox.open = true;
			props.itemBox.open = originalOpenState;
			props.itemBox._section.toggleAttribute("open", true);

			// now hide the section header for toggling the item box
			// remove the collapsible section:
			// item box contains
			// <collapsible section>
			//     <head/>
			//     <body/>
			// </collapsible section>
			(
				props.itemBox.firstChild!.firstChild! as HTMLElement
			).style.display = "none";
		} catch (error: any) {
			alert(error);
		}
	}, []);

	function onItemTypeChange() {
		setPidTypes(props.item.getPIDTypes());
		setHiddenFields(props.item.item.itemTypeID);
		props.itemBox._forceRenderAll(); // need to force a new render
	}

	function setHiddenFields(itemTypeID: number) {
		const visibleFieldIDs = visibleBaseFieldNames.map((fieldName) =>
			Zotero.ItemFields.getFieldIDFromTypeAndBase(itemTypeID, fieldName),
		);
		props.itemBox.hiddenFields = Zotero.ItemFields.getItemTypeFields(
			itemTypeID,
		)
			.filter((fieldID: string) => !visibleFieldIDs.includes(fieldID))
			.map((fieldID: string) => Zotero.ItemFields.getName(fieldID))
			.concat(["dateAdded", "dateModified"]);
	}

	return (
		<div id="citation-editor-footer" box-orient="vertical">
			<div className="pid-list">
				{pidTypes.map((pidType: PIDType) => (
					<PIDRow
						autosave={false}
						editable={true}
						item={props.item}
						key={pidType}
						type={pidType}
						validate={props.checkCitationPID}
					/>
				))}
			</div>
			<div id="citation-editor-buttons">
				<button
					onClick={() => {
						props.onRefresh();
						onItemTypeChange();
					}}
				>
					{props.getString("wikicite.editor.refresh")}
				</button>
				<button onClick={props.onCancel}>
					{props.getString("wikicite.editor.cancel")}
				</button>
				<button onClick={props.onSave}>
					{props.getString("wikicite.editor.save")}
				</button>
			</div>
		</div>
	);
};

export default CitationEditor;
