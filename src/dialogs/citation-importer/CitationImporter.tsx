import React, { useState } from "react";
import PropTypes from "prop-types";

const CitationImporter = (props: any) => {
	const [text, setText] = useState("");

	return (
		// TS doesn't like orient in div
		// <div orient="vertical">
		<div>
			<div id="citation-importer-description">
				<label>
					{props.getString("citation-importer.description")}
				</label>
			</div>
			<div id="citation-importer-textbox">
				<textarea
					id="citation-input"
					onChange={(event) => setText(event.target.value)}
					rows={15}
					value={text}
				/>
			</div>
			<div id="citation-importer-buttons">
				<button onClick={props.onCancel}>
					{props.getString("citation-importer.cancel")}
				</button>
				<button onClick={props.onImportFile}>
					{props.getString("citation-importer.import-file")}
				</button>
				<button
					disabled={!text}
					onClick={() => props.onImportText(text)}
				>
					{props.getString("citation-importer.import-text")}
				</button>
			</div>
		</div>
	);
};

CitationImporter.propTypes = {
	getString: PropTypes.func,
	onCancel: PropTypes.func,
	onImportFile: PropTypes.func,
	onImportText: PropTypes.func,
};

export default CitationImporter;
