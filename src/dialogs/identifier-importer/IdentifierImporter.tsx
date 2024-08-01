import * as React from "react";
import * as PropTypes from "prop-types";

const IdentifierImporter = (props: {
	getString: (name: string) => string;
	onCancel: () => void;
	onImport: () => void;
}) => (
	// TS gives an error about using orient here
	// <div orient="vertical">
	<div>
		<div id="identifier-importer-description">
			<label>
				{props.getString("wikicite.identifier-importer.description")}
			</label>
		</div>
		<div id="identifier-importer-textbox">
			<textarea id="identifier-input" rows={5} autoFocus />
		</div>
		<div id="identifier-importer-buttons">
			<button onClick={props.onCancel}>
				{props.getString("wikicite.identifier-importer.cancel")}
			</button>
			<button onClick={props.onImport}>
				{props.getString("wikicite.identifier-importer.add")}
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
