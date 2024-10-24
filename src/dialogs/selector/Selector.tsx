import * as React from "react";

interface SelectorProps {
	choices: string[];
	message: string;
	getString: (name: string) => string;
	onCancel: () => void;
	onConfirm: () => void;
}

const Selector = (props: SelectorProps) => (
	<div>
		<div id="selector-description">
			<label>{props.message}</label>
		</div>
		<div id="selector-select">
			<select
				size={Math.min(props.choices.length, 10)}
				id="selector-list"
			>
				{props.choices.map((text, index) => (
					<option key={index}>{text}</option>
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

export default Selector;
