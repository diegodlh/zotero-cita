import * as React from "react";
import { useState } from "react";
import * as PropTypes from "prop-types";

const CitationImporter = (props: {
	getString: (name: string) => string;
	onCancel: () => void;
	onImportFile: () => void;
	onImportText: (text: string) => void;
}) => {
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
					rows={5}
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
