import * as React from "react";
import * as PropTypes from "prop-types";
import Citation from "../../cita/citation";
import { config } from "../../../package.json";

function ZoteroButton(props: any) {
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
				key &&
					React.createElement(
						"toolbarbutton",
						{
							className: "zotero-clicky",
							//tabIndex: 0,
							onClick: goToLinkedItem,
						},
						<img
							className="toolbarbutton-icon"
							src="chrome://zotero/skin/16/universal/show-item.svg"
							title="Go to linked Zotero item"
						></img>,
					)
			}
			{
				// Link/unlink
				React.createElement(
					"toolbarbutton",
					{
						className: "zotero-clicky show-on-hover no-display",
						//tabIndex: 0,
						onClick: linkUnlinkItem,
					},
					<img
						className="toolbarbutton-icon"
						src={
							key
								? // We use a modified version of the unlink icon since the original has a fill color
									`chrome://${config.addonRef}/content/skin/default/unlink.svg`
								: "chrome://zotero/skin/16/universal/link.svg"
						}
						title={(key ? "Unlink" : "Link") + " Zotero item"}
					></img>,
				)
			}
		</>
	);
}

ZoteroButton.propTypes = {
	citation: PropTypes.instanceOf(Citation),
};

export default ZoteroButton;
