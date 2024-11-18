import * as React from "react";
import Citation from "../../cita/citation";
import { config } from "../../../package.json";
import ToolbarButton from "./toolbarButton";

interface WikidataButtonProps {
	citation: Citation;
	onClick: React.MouseEventHandler;
}

function WikidataButton(props: WikidataButtonProps) {
	const citation = props.citation;
	const syncable = citation.source.qid && citation.target.qid;
	const oci = citation.getOCI("wikidata");
	let title;
	let imgSrc = `chrome://${config.addonRef}/content/skin/default/wikidata-`;
	if (oci) {
		if (oci.valid) {
			title = "See in OpenCitations";
			imgSrc += "tick";
		} else {
			title = "Identifier mismatch";
			imgSrc += "cross";
		}
	} else {
		if (syncable) {
			title = "Sync citation with Wikidata";
			imgSrc += "sync";
		} else {
			title =
				"Both source and target items must have QID to sync to Wikidata";
			imgSrc += "light";
		}
	}
	imgSrc += ".png";

	return (
		<ToolbarButton
			className="zotero-clicky show-on-hover no-display"
			onClick={props.onClick}
			imgSrc={imgSrc}
			title={title}
		/>
	);
}

export default WikidataButton;
