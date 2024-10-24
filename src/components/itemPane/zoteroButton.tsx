import * as React from "react";
import Citation from "../../cita/citation";
import ToolbarButton from "./toolbarButton";

/**
 * Only shows when the item is linked to a Zotero item
 * @param props
 * @returns
 */
function ZoteroButton(props: { citation: Citation }) {
	const key = props.citation.target.key;

	function goToLinkedItem() {
		if (key) {
			const libraryID = props.citation.source.item.libraryID;
			const item = Zotero.Items.getByLibraryAndKey(
				libraryID,
				key,
			) as Zotero.Item;

			ZoteroPane.selectItem(item.id);
		}
	}

	return (
		// Goto
		key && (
			<ToolbarButton
				className="zotero-clicky"
				imgSrc={"chrome://zotero/skin/16/universal/show-item.svg"}
				onClick={goToLinkedItem}
				title="Go to linked Zotero item"
			/>
		)
	);
}

export default ZoteroButton;
