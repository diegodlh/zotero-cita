import * as React from "react";
import * as PropTypes from "prop-types";
import Citation from "../../cita/citation";
import { config } from "../../../package.json";

function WikidataButton(props: {
	citation: Citation;
	onClick: React.MouseEventHandler;
}) {
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

	return React.createElement(
		"toolbarbutton",
		{
			className: "zotero-clicky show-on-hover no-display",
			//tabIndex: 0,
			onClick: props.onClick,
		},
		<img
			className="toolbarbutton-icon cita-icon"
			src={imgSrc}
			title={title}
		></img>,
	);
}

WikidataButton.propTypes = {
	citation: PropTypes.instanceOf(Citation),
	onClick: PropTypes.func,
};

export default WikidataButton;
