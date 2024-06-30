import PropTypes from "prop-types";
import React from "react";

const IdentifierImporter = (props: any) => (
	// TS gives an error about using orient here
	// <div orient="vertical">
	<div>
		<div id="identifier-importer-description">
			<label>{props.getString("identifier-importer.description")}</label>
		</div>
		<div id="identifier-importer-textbox">
			<textarea id="identifier-input" rows={5} autoFocus />
		</div>
		<div id="identifier-importer-buttons">
			<button onClick={props.onCancel}>
				{props.getString("identifier-importer.cancel")}
			</button>
			<button onClick={props.onImport}>
				{props.getString("identifier-importer.add")}
			</button>
		</div>
	</div>
);

IdentifierImporter.propTypes = {
	getString: PropTypes.func,
	onCancel: PropTypes.func,
	onImport: PropTypes.func,
};

export default IdentifierImporter;
