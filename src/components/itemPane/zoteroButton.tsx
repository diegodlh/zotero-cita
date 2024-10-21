import * as React from "react";
import Citation from "../../cita/citation";
import { config } from "../../../package.json";
import ToolbarButton from "./toolbarButton";

interface ZoteroButtonProps {
	citation: Citation;
}

function ZoteroButton(props: ZoteroButtonProps) {
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

	function linkUnlinkItem() {
		if (key) {
			// Unlink
			props.citation.unlinkFromZoteroItem();
		} else {
			// Link
			props.citation.autoLink();
		}
	}

	// States:
	// 1. Unlinked: auto link or manually link on click
	// 2. Linked: go to Zotero item
	return (
		<>
			{
				// Goto
				key && (
					<ToolbarButton
						className="zotero-clicky"
						imgSrc={
							"chrome://zotero/skin/16/universal/show-item.svg"
						}
						onClick={goToLinkedItem}
						title="Go to linked Zotero item"
					/>
				)
			}
			{
				// Link/unlink
				<ToolbarButton
					className="zotero-clicky show-on-hover no-display"
					imgSrc={
						key
							? // We use a modified version of the unlink icon since the original has a fill color
								`chrome://${config.addonRef}/content/skin/default/unlink.svg`
							: "chrome://zotero/skin/16/universal/link.svg"
					}
					onClick={linkUnlinkItem}
					title={(key ? "Unlink" : "Link") + " Zotero item"}
				/>
			}
		</>
	);
}

export default ZoteroButton;
