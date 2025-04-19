/* License */
import * as React from "react";
import { useEffect, useState, useRef } from "react";
import Wikicite, { debug } from "../../cita/wikicite";
import { Citation } from "../../cita/citation";
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
	const citations = props.sourceItem.citations;
	const containerRef = useRef<HTMLDivElement>(null);

	function sortIndices(sortBy: string, citations: Citation[]) {
		const items: {
			index: number;
			value: string | number | Date | undefined;
		}[] = citations.map((citation: Citation, index: number) => {
			let value;
			switch (sortBy) {
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
		});
		items.sort((a, b) => (a.value! > b.value! ? 1 : -1));
		return items.map((item) => item.index);
	}

	const sortedIndices = React.useMemo(
		() => sortIndices(props.sortBy, citations),
		[props.sortBy, citations],
	);

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
			"chrome,dialog=no,modal,centerscreen,resizable,width=380,height=600",
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
		citation.target.item = item;
		citation.lastModificationDate = new Date();

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
		</div>
	);
}

export default CitationsBox;
