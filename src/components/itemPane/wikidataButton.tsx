import * as React from "react";
import Citation from "../../cita/citation";
import { config } from "../../../package.json";
import ToolbarButton from "./toolbarButton";
import Wikicite from "../../cita/wikicite";

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
			title = Wikicite.getString("wikicite.citation-menu.oci");
			imgSrc += "tick";
		} else {
			title = Wikicite.getString("wikicite.oci.mismatch.title");
			imgSrc += "cross";
		}
	} else {
		if (syncable) {
			title = Wikicite.getString("wikicite.citation-menu.sync-wikidata");
			imgSrc += "sync";
		} else {
			title = Wikicite.getString(
				"wikicite.citation-menu.sync-wikidata.both-qid-required",
			);
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
