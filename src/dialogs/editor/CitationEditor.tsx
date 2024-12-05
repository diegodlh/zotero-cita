import * as React from "react";
import { useEffect, useState } from "react";
import ItemWrapper from "../../cita/itemWrapper";
import Lookup from "../../cita/zotLookup";
import ToolbarButton from "../../components/itemPane/toolbarButton";
import Wikicite from "../../cita/wikicite";
import PID from "../../cita/PID";
import PIDBox from "../../components/itemPane/pidBox";

const visibleBaseFieldNames = ["title", "publicationTitle", "date"];

interface CitationEditorProps {
	checkCitationPID: (type: PIDType, value: string) => boolean;
	item: ItemWrapper;
	itemBox: any;
	sourceLabel: string;
	sourceType: Zotero.Item.ItemType;
	getString: (name: string) => string;
	onCancel: () => void;
	onSave: () => void;
	editorSetShownPIDs: (shownPIDs: Set<PIDType>) => void;
	editorOnPIDChange: (callback?: (pidTypes: Set<PIDType>) => void) => void;
}

// Fixme: as a Citation Editor (not a target item editor)
// consider providing at least some read only information about the citation
// such as label of the source item, OCIs, and Zotero link status
const CitationEditor = (props: CitationEditorProps) => {
	const initialShown = PID.alwaysShown.union(
		PID.showable.intersection(props.item.validAvailablePIDTypes),
	);
	const [shownPIDs, setShownPIDs] = useState(initialShown);

	useEffect(() => {
		props.editorSetShownPIDs(shownPIDs);

		// Register a callback to sync overlay changes back to React.
		const handlePIDChange = (updatedShownPIDs: Set<PIDType>) => {
			setShownPIDs(new Set(updatedShownPIDs)); // Update React state with overlay changes.
		};

		props.editorOnPIDChange(handlePIDChange);

		return () => {
			// Cleanup if necessary
			props.editorOnPIDChange(undefined); // Deregister callback when component unmounts.
		};
	}, [shownPIDs]);

	async function onRefresh() {
		const pid = props.item.getBestPID(Lookup.pidsSupportedForImport);
		if (pid) {
			const fetchedItem = await Lookup.lookupIdentifiers([pid]);
			if (fetchedItem && fetchedItem.length) {
				props.item.item = fetchedItem[0];
				// Reset saveTX to prevent saving the item
				props.item.item.saveTx = () => props.itemBox._forceRenderAll();
				props.itemBox.item = props.item.item;
				props.itemBox._forceRenderAll();
			}
		}
	}

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
			//     <head>
			//         <title-box/>
			//         <popupset/> <!-- keep this for the title-related popups to work -->
			//		   <toolbarbutton/>
			//     </head>
			//     <body/>
			// </collapsible section>
			(props.itemBox as XULElement)
				.querySelectorAll(".head > :not(popupset)") // keep the popupset for the title-related popups to work
				.forEach((el) => ((el as HTMLElement).style.display = "none"));
		} catch (error: any) {
			alert(error);
		}
	}, [props.item]);

	function onItemTypeChange() {
		setShownPIDs(props.item.validPIDTypes);
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

	const pidAddMenu = document.getElementById(
		"pid-row-add-menu",
	) as unknown as XULPopupElement;

	const showAddButton =
		props.item.validPIDTypes
			.intersection(PID.showable)
			.difference(shownPIDs).size > 0;

	return (
		<div id="citation-editor-footer" box-orient="vertical">
			<div id="pid-header">
				<h4>{"Identifiers"}</h4>
				{showAddButton && (
					<ToolbarButton
						className="zotero-clicky add-pid"
						tabIndex={1}
						title={Wikicite.getString("wikicite.editor.add")}
						imgSrc="chrome://zotero/skin/16/universal/plus.svg"
						onClick={(event) => {
							pidAddMenu.openPopup(
								event.currentTarget,
								"after_end",
							);
						}}
					/>
				)}
			</div>
			<PIDBox
				editable={true}
				autosave={false}
				item={props.item}
				shownPIDs={shownPIDs}
				setShownPIDs={setShownPIDs}
				checkPID={props.checkCitationPID}
			/>
			<div className="citation-source-info">
				<h4>{"Source"}</h4>
				<div className="citations-box-list-container">
					<div className="row">
						{/* We disable the hover effects this way */}
						<div className="box" {...{ disabled: true }}>
							<span
								className="icon icon-css icon-item-type"
								data-item-type={props.sourceType}
							></span>
							<span className="label">{props.sourceLabel}</span>
						</div>
					</div>
				</div>
			</div>
			<div id="citation-editor-buttons">
				<button
					onClick={() => {
						onRefresh();
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
