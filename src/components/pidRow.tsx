/* License */
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import * as PropTypes from "prop-types";
// import Editable from "zotero@components/editable";
import ItemWrapper from "../cita/itemWrapper";

function PIDRow(props: {
	autosave: boolean;
	editable: boolean;
	item: ItemWrapper;
	type: PIDType;
	validate: (type: PIDType, value: string) => boolean;
}) {
	const textboxRef = useRef(null);
	const [selected, setSelected] = useState(false);
	const [value, setValue] = useState(props.item.getPID(props.type));
	const [url, setUrl] = useState(props.item.getPidUrl(props.type));

	useEffect(() => {
		setValue(props.item.getPID(props.type));
	}, [props.item, props.type]);

	useEffect(() => {
		setUrl(props.item.getPidUrl(props.type));
	}, [props.type, value]);

	function handleCancel() {
		setSelected(false);
	}

	function handleCommit(newPid: string, hasChanged: boolean) {
		if (hasChanged) {
			if (
				newPid &&
				props.validate &&
				!props.validate(props.type, newPid)
			) {
				return;
			}
			props.item.setPID(props.type, newPid, props.autosave);
			// set new value immediately
			// if autosave is true, it will be updated twice
			// but second time (via props.item) might take some time
			setValue(props.item.getPID(props.type));
		}
		setSelected(false);
	}

	function handleEdit() {
		if (!props.editable) {
			return;
		}
		setSelected(true);
	}

	async function onFetch() {
		await props.item.fetchPID(props.type, props.autosave);
		// set new value immediately (see note in handleCommit)
		setValue(props.item.getPID(props.type));
	}

	return (
		<li>
			<label
				className={"pid-label" + (url ? " pointer" : "")}
				onClick={url ? () => Zotero.launchURL(url) : undefined}
			>
				{props.type.toUpperCase()}
			</label>
			<div className="editable-container">
				{/* Causes a warning, because Input uses componentWillReceiveProps
                which has been renamed and is not recommended. But won't show
                in non-strict mode because Zotero devs renamed it to UNSAFE_*/}
				{/* <Editable */}
				{/* fix: replaced Editable with input until we work out how to import zotero components */}
				<input
					type="text"
					// There is a bug in Zotero's React Input component
					// Its handleChange event is waiting for an options
					// parameter from the child input element's onChange
					// event. This is provided by the custom input element
					// Autosuggest, but not by the regular HTML input.
					// This doesn't happen with TextArea, because its
					// handleChange doesn't expect an options parameter.
					// autoComplete={true}
					// For the autoComplete workaround to work above,
					// a getSuggestions function must be provided.
					// Have it return an empty suggestions array.
					// getSuggestions={(): any => []}
					// ...and a ref too
					// ref={textboxRef}
					// autoFocus
					className={
						props.editable && !selected ? "zotero-clicky" : ""
					}
					// isActive={selected}
					// isReadOnly={!props.editable}
					readOnly={!props.editable}
					// onAbort={handleCancel}
					// onCancel={handleCancel}
					// onClick={handleEdit}
					// onCommit={handleCommit}
					// onFocus={handleEdit}
					// onPaste={handlePaste}  // what happens if I paste multiline?
					// selectOnFocus={true}

					// note: input needs an onchange handler or it won't render
					onChange={
						(event) => {
							return;
						} /* do something */
					}
					value={value || ""}
				/>
			</div>
			<button onClick={() => onFetch()}>
				<img
					className="cita-icon"
					title={`Fetch ${props.type}`}
					src={`chrome://zotero/skin/arrow_refresh.png`}
				/>
			</button>
		</li>
	);
}

PIDRow.propTypes = {
	autosave: PropTypes.bool,
	editable: PropTypes.bool,
	item: PropTypes.instanceOf(ItemWrapper),
	type: PropTypes.string,
	validate: PropTypes.func,
};

export default PIDRow;
