/* License */
import * as React from "react";
import { useEffect, useState } from "react";
import * as PropTypes from "prop-types";
import Wikicite, { debug } from "../../cita/wikicite";

// fix: CSS doesn't work
import "./citationsBox.css";

// fix: Not sure how to import react components from Zotero
// import { Button } from "../button";
// try {
// 	const Button = require("components/button");
// } catch (err) {
// 	throw err;
// }

import PIDRow from "../pidRow";
import Citation from "../../cita/citation";
import SourceItemWrapper from "../../cita/sourceItemWrapper";
import WikidataButton from "./wikidataButton";
import ZoteroButton from "./zoteroButton";

function CitationsBox(props: {
	editable: boolean;
	sortBy: string;
	sourceItem: SourceItemWrapper;
	onItemPopup: (event: Event) => void;
	onCitationPopup: (event: React.MouseEvent, index: number) => void;
	// Button: any;
}) {
	const [citations, setCitations] = useState([] as Citation[]);
	const [pidTypes, setPidTypes] = useState([] as PIDType[]);
	const [sortedIndices, setSortedIndices] = useState([] as number[]);
	const [hasAttachments, setHasAttachments] = useState(false);

	const removeStr = Zotero.getString("general.remove");

	// const Button = props.Button;

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
					case "ordinal":
						value = index;
						break;
					case "authors":
						value = citation.target.item.getField("firstCreator");
						break;
					case "date":
						const date = Zotero.Date.strToISO(
							citation.target.item.getField("date"),
						);
						if (date) {
							// strToISO could return a string or false
							value = new Date(date);
						}
						break;
					case "title":
						value = citation.target.title;
						break;
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
	function openEditor(citation: Citation) {
		// const args = {
		// 	citation: citation,
		// 	Wikicite: Wikicite,
		// };
		const retVals: { [key: string]: any } = {};
		// fix
		// window.openDialog(
		// 	"chrome://cita/content/citationEditor.xul",
		// 	"",
		// 	"chrome,dialog=no,modal,centerscreen,resizable=yes",
		// 	args,
		// 	retVals,
		// );
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
		// fix: getOCI function - not sure how it should work?
		// let sync = false;
		// const citation = citations[index];
		// if (citation.getOCI("wikidata")) {
		// 	// Fixme: offer to remember user choice
		// 	// get this from preferences: remembered "delete remote too" choice
		// 	// const remember = {value: false};
		// 	const bttnFlags =
		// 		Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_NO +
		// 		Services.prompt.BUTTON_POS_1 *
		// 			Services.prompt.BUTTON_TITLE_CANCEL +
		// 		Services.prompt.BUTTON_POS_2 *
		// 			Services.prompt.BUTTON_TITLE_YES +
		// 		Services.prompt.BUTTON_POS_2_DEFAULT;
		// 	const response = Services.prompt.confirmEx(
		// 		window,
		// 		Wikicite.getString(
		// 			"wikicite.citations-pane.delete.remote.title",
		// 		),
		// 		Wikicite.getString(
		// 			"wikicite.citations-pane.delete.remote.message",
		// 		),
		// 		bttnFlags,
		// 		"",
		// 		"",
		// 		"",
		// 		undefined, // Wikicite.getString('wikicite.citations-pane.delete.remote.remember'),
		// 		{}, // remember
		// 	);
		// 	switch (response) {
		// 		case 0:
		// 			// no
		// 			sync = false;
		// 			break;
		// 		case 1:
		// 			// cancel
		// 			return;
		// 		case 2:
		// 			// yes
		// 			sync = true;
		// 			break;
		// 	}
		// }
		// await props.sourceItem.deleteCitation(index, sync);
	}

	function handleCitationMove(index: number, shift: number) {
		const newCitations = props.sourceItem.citations;
		const citation = newCitations.splice(index, 1)[0];
		const newIndex = index + shift;
		newCitations.splice(newIndex, 0, citation);
		props.sourceItem.citations = newCitations;
	}

	function handleCitationSync(index: number) {
		// fix: getOCI function - not sure how it should work?
		// Fixme: consider making this a Citation method
		// const citation = citations[index];
		// const syncable = citation.source.qid && citation.target.qid;
		// const oci = citation.getOCI("wikidata");
		// if (oci) {
		// 	if (oci.valid) {
		// 		citation.resolveOCI("wikidata");
		// 	} else {
		// 		// oci is invalid, i.e., citing or cited id do not match with
		// 		// local source or target id
		// 		Services.prompt.alert(
		// 			window,
		// 			Wikicite.getString("wikicite.oci.mismatch.title"),
		// 			Wikicite.formatString("wikicite.oci.mismatch.message", [
		// 				oci.supplier.charAt(0).toUpperCase() +
		// 					oci.supplier.slice(1),
		// 				oci.idType.toUpperCase(),
		// 				oci.citingId,
		// 				oci.citedId,
		// 			]),
		// 		);
		// 	}
		// } else if (syncable) {
		// 	props.sourceItem.syncWithWikidata(index);
		// } else {
		// 	Services.prompt.alert(
		// 		window,
		// 		Wikicite.getString("wikicite.citation.sync.error"),
		// 		Wikicite.getString("wikicite.citation.sync.error.qid"),
		// 	);
		// }
	}

	function renderCitationRow(citation: Citation, index: number) {
		const item = citation.target.item;
		const isFirstCitation = index === 0;
		const isLastCitation = index === citations.length - 1;
		const label = citation.target.getLabel();
		return (
			<li className="citation" key={index}>
				<img
					className="cita-icon"
					src={Zotero.ItemTypes.getImageSrc(item.itemType)}
					title={Zotero.ItemTypes.getLocalizedString(item.itemType)}
				/>
				<div className="editable-container" title={label}>
					<div
						className="editable"
						onClick={() => handleCitationEdit(index)}
					>
						<div className="zotero-clicky editable-content">
							{label}
						</div>
					</div>
				</div>
				{props.editable && (
					// https://github.com/babel/babel-sublime/issues/368
					<>
						<ZoteroButton citation={citation} />
						<WikidataButton
							citation={citation}
							onClick={() => handleCitationSync(index)}
						/>
						<button
							disabled={
								isFirstCitation || props.sortBy !== "ordinal"
							}
							onClick={() => handleCitationMove(index, -1)}
						>
							<img
								className="cita-icon"
								title="Move up"
								src={`chrome://zotero/skin/citation-up.png`}
							/>
						</button>
						<button
							disabled={
								isLastCitation || props.sortBy !== "ordinal"
							}
							onClick={() => handleCitationMove(index, +1)}
						>
							<img
								className="cita-icon"
								title="Move down"
								src={`chrome://zotero/skin/citation-down.png`}
							/>
						</button>
						<button
							title={removeStr}
							onClick={() => handleCitationDelete(index)}
							tabIndex={-1}
						>
							<img
								alt={removeStr}
								className="cita-icon"
								title={removeStr}
								// Fixme: does it change when active?
								src={`chrome://zotero/skin/minus${Zotero.hiDPISuffix}.png`}
							/>
						</button>
						<button
							className="btn-icon"
							onClick={(event) =>
								props.onCitationPopup(event, index)
							}
						>
							<span className="menu-marker"></span>
						</button>
					</>
				)}
			</li>
		);
	}

	return (
		<div className="citations-box">
			<div className="citations-box-header">
				<div className="citations-box-count">
					{/* todo: proper formatting */}
					{`${citations.length} citation(s):`}
					{/* {
						Wikicite.formatString(
						"wikicite.citations-pane.citations.count",
						citations.length,
					)} */}
				</div>
				{props.editable && (
					<div>
						<button onClick={() => handleCitationAdd()}>
							{/* todo: proper formatting */}
							Add
							{/* {Wikicite.getString("wikicite.citations-pane.add")} */}
						</button>
					</div>
				)}
				{<button onClick={() => props.onItemPopup}>More</button>}
				{/* fix: button is broken */}
				{/* <Button
					icon={
						<span>
							<img
								height="16px"
								src="chrome://cita/skin/wikicite.png"
							/>
						</span>
					}
					className="citations-box-actions"
					isMenu={true}
					onClick={props.onItemPopup}
					// todo: localise
					text="More"
					// text="wikicite.citations-pane.more"
					title=""
					size="sm"
				/> */}
			</div>
			<div className="citations-box-list-container">
				<ul className="citations-box-list">
					{/* Fixme: do not use index as React key - reorders will be slow!
                    https://reactjs.org/docs/reconciliation.html#keys
                    What about using something like bibtex keys?*/}
					{/* Maybe in the future the index of the Citation in the CitationList
                    will be a property of the Citation itself */}
					{sortedIndices.map((index) =>
						renderCitationRow(citations[index], index),
					)}
				</ul>
				{/* I understand this bit here makes TAB create a new tag
                { props.editable && <span
                    tabIndex="0"
                    onFocus={handleAddTag}
                /> }
                 */}
			</div>
			<div className="citations-box-footer">
				<ul id="citations-box-pids" className="pid-list">
					{
						// Fixme: to avoid parsing the extra field multiple times
						// (once per non-natively supported pid; e.g., QID, OCC)
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
										// todo: fix this once we know how
										// parentWindow: window,
									})
								}
							/>
						))
					}
				</ul>
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
	// Button: PropTypes.any, // need to require this from outside react
};

export default CitationsBox;
