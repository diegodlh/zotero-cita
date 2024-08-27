import * as React from "react";
import * as PropTypes from "prop-types";

const Selector = (props: {
	choices: string[];
	message: string;
	getString: (name: string) => string;
	onCancel: () => void;
	onConfirm: () => void;
}) => (
	<div>
		<div id="selector-description">
			<label>{props.message}</label>
		</div>
		<div id="selector-select">
			<select size={10} id="selector-list">
				{props.choices.map((text) => (
					<option>{text}</option>
				))}
			</select>
		</div>
		<div id="selector-buttons">
			<button onClick={props.onCancel}>
				{props.getString("wikicite.wikidata.reconcile.approx.cancel")}
			</button>
			<button onClick={props.onConfirm}>
				{props.getString("wikicite.wikidata.reconcile.approx.confirm")}
			</button>
		</div>
	</div>
);

Selector.propTypes = {
	choices: PropTypes.arrayOf(PropTypes.string),
	message: PropTypes.string,
	getString: PropTypes.func,
	onCancel: PropTypes.func,
	onConfirm: PropTypes.func,
};

export default Selector;
