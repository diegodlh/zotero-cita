/* License */
import * as React from "react";
import { useEffect, useState } from "react";
import * as PropTypes from "prop-types";
import Wikicite, { debug } from "../../cita/wikicite";
import PIDRow from "../pidRow";
import Citation from "../../cita/citation";
import SourceItemWrapper from "../../cita/sourceItemWrapper";
import WikidataButton from "./wikidataButton";
import ZoteroButton from "./zoteroButton";
import ImportButton from "./importButton";
import { config } from "../../../package.json";

function CitationsBox(props: {
	editable: boolean;
	sortBy: string;
	sourceItem: SourceItemWrapper;
	onItemPopup: (event: React.MouseEvent) => void;
	onCitationPopup: (event: React.MouseEvent, index: number) => void;
}) {
	const [citations, setCitations] = useState([] as Citation[]);
	const [pidTypes, setPidTypes] = useState([] as PIDType[]);
	const [sortedIndices, setSortedIndices] = useState([] as number[]);
	const [hasAttachments, setHasAttachments] = useState(false);

	const removeStr = Zotero.getString("general.remove");
	const optionsStr = "Open context menu";

	useEffect(() => {
		setCitations(props.sourceItem.citations);
		setPidTypes(props.sourceItem.getPIDTypes());
		setHasAttachments(
			Boolean(props.sourceItem.item.getAttachments().length),
		);
	}, [props.sourceItem]);

	useEffect(() => {
		// update citations box height when pid types are updated
		// and pid rows are rendered below
		// todo: do we still need to do this?
		// window.WikiciteChrome.zoteroOverlay.updateCitationsBoxSize(
		// 	window.document,
		// );
	}, [pidTypes]);

	useEffect(() => {
		const items: {
			index: number;
			value: string | number | Date | undefined;
		}[] = props.sourceItem.citations.map(
			(citation: Citation, index: number) => {
				let value;
				switch (props.sortBy) {
					case "ordinal": {
						value = index;
						break;
					}
					case "authors": {
						value = citation.target.item.getField("firstCreator");
						break;
					}
					case "date": {
						const date = Zotero.Date.strToISO(
							citation.target.item.getField("date"),
						);
						if (date) {
							// strToISO could return a string or false
							value = new Date(date);
						}
						break;
					}
					case "title": {
						value = citation.target.title;
						break;
					}
					default:
				}
				return { index: index, value: value };
			},
		);
		items.sort((a, b) => (a.value! > b.value! ? 1 : -1));
		setSortedIndices(items.map((item) => item.index));
	}, [props.sortBy, props.sourceItem]);

	/**
	 * Opens the citation editor window.
	 * @param {Citation} citation - Citation to be edited.
	 * @returns {Zotero.Item} - Edited cited item.
	 */
	function openEditor(citation: Citation): Zotero.Item | undefined {
		const args = {
			citation: citation,
			addon: addon,
			ZoteroPane: ZoteroPane,
			goUpdateGlobalEditMenuItems:
				window.document.defaultView!.goUpdateGlobalEditMenuItems,
		};
		const retVals: { [key: string]: any } = {};
		window.openDialog(
			`chrome://${config.addonRef}/content/citationEditor.xhtml`,
			"",
			"chrome,dialog=no,modal,centerscreen,resizable,width=300,height=500",
			args,
			retVals,
		);
		return retVals.item;
	}

	function handleCitationAdd() {
		const citation = new Citation(
			{
				item: {
					itemType: "journalArticle", // Fixme: maybe replace with a const
				},
				ocis: [],
			},
			props.sourceItem,
		);
		const item = openEditor(citation);
		if (!item) {
			debug("Edit cancelled by user.");
			return;
		}
		if (
			props.sourceItem.getPID("QID") &&
			Wikicite.getExtraField(item, "QID").values[0]
		) {
			debug(
				"Source and target items have QIDs! Offer syncing to Wikidata.",
			);
		}
		citation.target.item = item;

		// Make sure the component updates even before changes are saved to the item
		// setCitations(
		//   // sourceItem.citations  // this doesn't work because sourceItem.citation object's reference hasn't changed
		//   // () => sourceItem.citations  // works only one time per render - possibly because the function itself doesn't change
		//   [...sourceItem.citations]  // works
		// );
		// Problem is if I do this [...citations], the citations passed down to CitationsBox
		// are not the citations of the CitationsList here. Therefore, if I implement methods
		// in the Citation class to modify themselves, they won't work.

		// This will save changes to the item's extra field
		// The modified item observer above will be triggered.
		// This will update the sourceItem ref, and the component's state.
		props.sourceItem.addCitations(citation);
		// props.sourceItem.save();
		// Unexpectedly, this also triggers the zotero-items-tree `select` event
		// which in turn runs zoteroOverlay's refreshCitationsPaneMethod.
		// However, as props.item will not have changed, component will not update.
	}

	function handleCitationEdit(index: number) {
		const citation = citations[index];
		const item = openEditor(citation);
		// Fixme: I don't like that I'm repeating code from addCitation
		// tagsBox has a single updateTags method instead
		if (!item) {
			debug("Edit cancelled by user.");
			return;
		}
		if (
			props.sourceItem.getPID("QID") &&
			Wikicite.getExtraField(item, "QID").values[0]
		) {
			debug(
				"Source and target items have QIDs! Offer syncing to Wikidata.",
			);
		}
		citation.target.item = item;

		const newCitations = props.sourceItem.citations;
		newCitations[index] = citation;
		props.sourceItem.citations = newCitations;
	}

	async function handleCitationDelete(index: number) {
		let sync = false;
		const citation = citations[index];
		if (citation.getOCI("wikidata")) {
			// Fixme: offer to remember user choice
			// get this from preferences: remembered "delete remote too" choice
			// const remember = {value: false};
			const bttnFlags =
				Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_NO +
				Services.prompt.BUTTON_POS_1 *
					Services.prompt.BUTTON_TITLE_CANCEL +
				Services.prompt.BUTTON_POS_2 *
					Services.prompt.BUTTON_TITLE_YES +
				Services.prompt.BUTTON_POS_2_DEFAULT;
			const response = Services.prompt.confirmEx(
				window as mozIDOMWindowProxy,
				Wikicite.getString(
					"wikicite.citations-pane.delete.remote.title",
				),
				Wikicite.getString(
					"wikicite.citations-pane.delete.remote.message",
				),
				bttnFlags,
				"",
				"",
				"",
				"", // Wikicite.getString('wikicite.citations-pane.delete.remote.remember'),
				{ value: false }, // remember
			);
			switch (response) {
				case 0:
					// no
					sync = false;
					break;
				case 1:
					// cancel
					return;
				case 2:
					// yes
					sync = true;
					break;
			}
		}
		await props.sourceItem.deleteCitation(index, sync);
	}

	function handleCitationMove(index: number, newIndex: number) {
		const newCitations = props.sourceItem.citations;
		const [movedCitation] = newCitations.splice(index, 1);
		newCitations.splice(newIndex, 0, movedCitation);
		props.sourceItem.citations = newCitations;

		// Reset hover effects
		// Block hover effects on creators, enable them back on first mouse movement.
		// See comment in creatorDragPlaceholder() for explanation
		document
			.querySelectorAll(".citations-box-list-container .row")
			.forEach((row) => {
				row.classList.add("noHover");
			});

		const removeHoverBlock = () => {
			const noHoverRows = document.querySelectorAll(".noHover");
			noHoverRows.forEach((el) => el.classList.remove("noHover"));
			document.removeEventListener("mousemove", removeHoverBlock);
		};
		document.addEventListener("mousemove", removeHoverBlock);
	}

	function handleCitationSync(index: number) {
		// Fixme: consider making this a Citation method
		const citation = citations[index];
		const syncable = citation.source.qid && citation.target.qid;
		const oci = citation.getOCI("wikidata");
		if (oci) {
			if (oci.valid) {
				citation.resolveOCI("wikidata");
			} else {
				// oci is invalid, i.e., citing or cited id do not match with
				// local source or target id
				Services.prompt.alert(
					window as mozIDOMWindowProxy,
					Wikicite.getString("wikicite.oci.mismatch.title"),
					Wikicite.formatString("wikicite.oci.mismatch.message", [
						oci.supplierName.charAt(0).toUpperCase() +
							oci.supplierName.slice(1),
						oci.idType.toUpperCase(),
						oci.citingId,
						oci.citedId,
					]),
				);
			}
		} else if (syncable) {
			props.sourceItem.syncWithWikidata(index);
		} else {
			Services.prompt.alert(
				window as mozIDOMWindowProxy,
				Wikicite.getString("wikicite.citation.sync.error"),
				Wikicite.getString("wikicite.citation.sync.error.qid"),
			);
		}
	}

	function renderGrippy() {
		if (props.sortBy !== "ordinal") return;

		const handleMouseDown = (e: React.MouseEvent) => {
			e.currentTarget.closest(".row")?.setAttribute("draggable", "true");
		};

		const handleMouseUp = (e: React.MouseEvent) => {
			e.currentTarget.closest(".row")?.setAttribute("draggable", "false");
		};

		return React.createElement(
			"toolbarbutton",
			{
				className: "zotero-clicky zotero-clicky-grippy show-on-hover",
				tabIndex: -1,
				onMouseDown: handleMouseDown,
				onMouseUp: handleMouseUp,
			},
			<img
				className="toolbarbutton-icon"
				src="chrome://zotero/skin/16/universal/grip.svg"
				alt="Drag"
			/>,
		);
	}

	function renderCitationRow(citation: Citation, index: number) {
		const item = citation.target.item;
		const label = citation.target.getLabel();

		// Drag handlers
		const handleDragStart: React.DragEventHandler<HTMLDivElement> = (e) => {
			const row = e.currentTarget;

			if (row.getAttribute("draggable") !== "true") {
				e.preventDefault();
				e.stopPropagation();
				return;
			}

			e.dataTransfer.setData(
				"application/zotero-citation-index",
				index.toString(),
			);
			e.dataTransfer.setDragImage(row, 15, 15);

			setTimeout(() => {
				row.classList.add("drag-hidden-citation");
				row.classList.add("noHover");
			});
		};

		const handleDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
			e.preventDefault();
			const draggedIndex = parseInt(
				e.dataTransfer.getData("application/zotero-citation-index"),
				10,
			);
			if (isNaN(draggedIndex)) {
				return;
			}

			const placeholder = document.querySelector(".drag-hidden-citation");
			const currentRow = e.currentTarget;

			// Ensure the placeholder isn't in the wrong place
			if (currentRow.previousSibling === placeholder) {
				currentRow.parentNode?.insertBefore(currentRow, placeholder);
			} else if (draggedIndex !== index && placeholder) {
				currentRow.parentNode?.insertBefore(placeholder, currentRow);
			}
		};

		const handleDrop = (e: React.DragEvent<Element>) => {
			e.preventDefault();

			// Get the index of the citation being dragged
			const draggedIndex = parseInt(
				e.dataTransfer.getData("application/zotero-citation-index"),
				10,
			);

			const row = e.currentTarget.closest(".row");

			const destinationIndex = row
				? Array.from(row.parentNode!.children).indexOf(row)
				: citations.length;

			// No change in order - do nothing
			if (draggedIndex === destinationIndex) {
				return;
			}

			// Due to some kind of drag-drop API issue,
			// after creator is dropped, the hover effect often stays at
			// the row's old location. To workaround that, set noHover class to block all
			// hover effects on creator rows and then remove it on the first mouse movement in refresh().
			document
				.querySelectorAll(".citations-box-list-container .row")
				.forEach((row) => {
					row.classList.add("noHover");
				});
			// Un-hide the moved creator row
			document
				.querySelector(".drag-hidden-citation")
				?.classList.remove("drag-hidden-citation");
			// Update the item after small delay to avoid blinking

			// Update the item after a small delay to avoid blinking
			setTimeout(() => {
				handleCitationMove(draggedIndex, destinationIndex);
			}, 250);
		};

		const handleDragEnd: React.DragEventHandler<HTMLDivElement> = (e) => {
			// If the row is still hidden, no 'drop' event happened, meaning creator rows
			// were not reordered. To make sure everything is in correct order, just refresh.
			/*if (e.currentTarget.classList.contains("drag-hidden-citation")) {
				this._forceRenderAll();
			}*/
			//e.currentTarget.classList.remove("drag-hidden-citation");
		};

		return (
			<div
				className="row"
				key={citation.hash}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
				onDragEnd={handleDragEnd}
			>
				{renderGrippy()}
				<div
					className="box keyboard-clickable"
					tabIndex={0}
					role="button"
					onClick={() => handleCitationEdit(index)}
				>
					<span
						className="icon icon-css icon-item-type"
						data-item-type={item.itemType}
					></span>
					<span className="label">{label}</span>
				</div>
				{props.editable && (
					<>
						<ImportButton citation={citation} />
						<ZoteroButton citation={citation} />
						<WikidataButton
							citation={citation}
							onClick={() => handleCitationSync(index)}
						/>
						{
							// Remove button
							React.createElement(
								"toolbarbutton",
								{
									className:
										"zotero-clicky zotero-clicky-minus show-on-hover no-display",
									tabIndex: 0,
									onClick: () => handleCitationDelete(index),
								},
								<img
									className="toolbarbutton-icon"
									src="chrome://zotero/skin/16/universal/minus-circle.svg"
									title={removeStr}
								></img>,
							)
						}
						{
							// Options button
							React.createElement(
								"toolbarbutton",
								{
									className:
										"zotero-clicky zotero-clicky-options show-on-hover no-display",
									tabIndex: 0,
									onClick: (event) =>
										props.onCitationPopup(event, index),
								},
								<img
									className="toolbarbutton-icon"
									src="chrome://zotero/skin/16/universal/options.svg"
									title={optionsStr}
								></img>,
							)
						}
					</>
				)}
			</div>
		);
	}

	return (
		<div className="citations-box">
			<div className="citations-box-list-container">
				{/* Citations now have a hash based on their JSON object (not stringfy), which allows better identification of the rows by React */}
				{sortedIndices.map((index) =>
					renderCitationRow(citations[index], index),
				)}
				{/* I understand this bit here makes TAB create a new tag
                { props.editable && <span
                    tabIndex="0"
                    onFocus={handleAddTag}
                /> }
                 */}
			</div>
			<div className="citations-box-footer">
				<div id="citations-box-pids" className="pid-list">
					{
						// Fixme: to avoid parsing the extra field multiple times
						// (once per non-natively supported pid; e.g., QID, OMID)
						// consider having a pidBox component and
						// redefining Wikicite.getExtraField to allow multiple fieldnames as input
						// and return a fieldName: [values]} object instead
						pidTypes.map((pidType: PIDType) => (
							<PIDRow
								autosave={true}
								editable={props.editable}
								item={props.sourceItem}
								key={pidType}
								type={pidType}
								validate={(type: PIDType, value: string) =>
									props.sourceItem.checkPID(type, value, {
										alert: true,
										// fix: this once we know how
										// parentWindow: window,
									})
								}
							/>
						))
					}
					{pidTypes.some(
						(pidType: PIDType) =>
							props.sourceItem.getPID(pidType) == null &&
							!["QID", "DOI"].includes(pidType),
					) ? (
						<div id="pid-row-add-btn">
							<button
								onClick={(event: React.MouseEvent) => {
									event.preventDefault();
									(
										document.getElementById(
											"pid-row-add-menu",
										) as any
									)?.openPopupAtScreen(
										window.screenX + event.clientX,
										window.screenY + event.clientY,
										true,
									);
								}}
							>
								+
							</button>
						</div>
					) : (
						""
					)}
				</div>
			</div>
		</div>
	);
}

CitationsBox.propTypes = {
	editable: PropTypes.bool,
	sortBy: PropTypes.string,
	sourceItem: PropTypes.instanceOf(SourceItemWrapper),
	onItemPopup: PropTypes.func,
	onCitationPopup: PropTypes.func,
};

export default CitationsBox;
