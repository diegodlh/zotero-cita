import * as React from "react";
import Citation from "../../cita/citation";
import { config } from "../../../package.json";
import ToolbarButton from "./toolbarButton";

function LinkButton(props: { citation: Citation }) {
	const key = props.citation.target.key;

	function linkUnlinkItem() {
		if (key) {
			// Unlink
			props.citation.unlinkFromZoteroItem();
		} else {
			// Link
			props.citation.autoLink();
		}
	}

	return (
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
	);
}

export default LinkButton;
