/* License */
import * as React from "react";
import { useEffect, useState, useRef } from "react";
import Wikicite, { debug } from "../../cita/wikicite";
import PIDRow from "../pidRow";
import Citation from "../../cita/citation";
import SourceItemWrapper from "../../cita/sourceItemWrapper";
import { config } from "../../../package.json";
import CitationRow from "./citationRow";

interface CitationsBoxProps {
	editable: boolean;
	sortBy: string;
	sourceItem: SourceItemWrapper;
	maxLineCount: number;
	onItemPopup: (event: React.MouseEvent) => void;
	onCitationPopup: (event: React.MouseEvent, index: number) => void;
}

function CitationsBox(props: CitationsBoxProps) {
	const [citations, setCitations] = useState([] as Citation[]);
	const [pidTypes, setPidTypes] = useState([] as PIDType[]);
	const [sortedIndices, setSortedIndices] = useState([] as number[]);
	const [hasAttachments, setHasAttachments] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setCitations(props.sourceItem.citations);
		setPidTypes(props.sourceItem.validPIDTypes);
		setHasAttachments(
			Boolean(props.sourceItem.item.getAttachments().length),
		);
	}, [props.sourceItem]);

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
			"chrome,dialog=no,modal,centerscreen,resizable,width=380,height=500",
			args,
			retVals,
		);
		return retVals.item;
	}

	function handleCitationEdit(index: number) {
		const citation = citations[index];
		const item = openEditor(citation);

		// Reset focus
		(document.activeElement as HTMLElement | XULElement).blur();

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
		props.sourceItem.setCitations(newCitations);
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

	function handleCitationMove(dragIndex: number, dropIndex: number) {
		const newCitations = Array.from(citations);
		const [movedCitation] = newCitations.splice(dragIndex, 1);
		newCitations.splice(dropIndex, 0, movedCitation);
		setCitations(newCitations);
		props.sourceItem.setCitations(newCitations);

		// Reset hover effects
		// Block and reset hover effects on the rows by adding and then removing the noHover class
		document
			.querySelectorAll(".citations-box-list-container .row")
			.forEach((row) => {
				(row as HTMLElement).classList.add("noHover");
			});

		const removeHoverBlock = () => {
			const noHoverRows = document.querySelectorAll(
				".citations-box-list-container .row.noHover",
			);
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

	return (
		<div className="citations-box">
			<div className="citations-box-list-container" ref={containerRef}>
				{/* Citations now have a hash based on their JSON object (not stringfy), which allows better identification of the rows by React */}
				{sortedIndices.map((index) => (
					<CitationRow
						key={citations[index].uuid}
						citation={citations[index]}
						citationsLength={citations.length}
						index={index}
						editable={props.editable}
						sortBy={props.sortBy}
						maxLineCount={props.maxLineCount}
						containerRef={containerRef}
						handleCitationEdit={handleCitationEdit}
						handleCitationDelete={handleCitationDelete}
						handleCitationSync={handleCitationSync}
						handleCitationMove={handleCitationMove}
						onCitationPopup={props.onCitationPopup}
					/>
				))}
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
					) && (
						<div id="pid-row-add-btn">
							<button
								onClick={(event: React.MouseEvent) => {
									event.preventDefault();
									(
										document.getElementById(
											"pid-row-add-menu",
										) as unknown as XULMenuPopupElement
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
					)}
				</div>
			</div>
		</div>
	);
}

export default CitationsBox;
