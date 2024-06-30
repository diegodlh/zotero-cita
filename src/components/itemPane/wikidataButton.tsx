import Citation from "../../cita/citation";
import PropTypes from "prop-types";
import React from "react";

function WikidataButton(props) {
	const citation = props.citation;
	const syncable = citation.source.qid && citation.target.qid;
	const oci = citation.getOCI("wikidata");
	let title;
	let imgSrc = "chrome://cita/skin/wikidata-";
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
		<button onClick={props.onClick}>
			<img className="cita-icon" title={title} src={imgSrc} />
		</button>
	);
}

WikidataButton.propTypes = {
	citation: PropTypes.instanceOf(Citation),
	onClick: PropTypes.func,
};

export default WikidataButton;
