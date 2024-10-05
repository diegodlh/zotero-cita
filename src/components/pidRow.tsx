/* License */
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import * as PropTypes from "prop-types";
import ItemWrapper from "../cita/itemWrapper";

function PIDRow(props: {
	autosave: boolean;
	editable: boolean;
	item: ItemWrapper;
	type: PIDType;
	validate: (type: PIDType, value: string) => boolean;
}) {
	const [value, setValue] = useState(props.item.getPID(props.type));
	const [url, setUrl] = useState(props.item.getPidUrl(props.type));

	useEffect(() => {
		setValue(props.item.getPID(props.type));
	}, [props.item, props.type]);

	useEffect(() => {
		setUrl(props.item.getPidUrl(props.type));
		// update the value of the input to match the new PID
		(
			document.getElementById(
				`pid-row-input-${props.item.key}-${props.type}`,
			)! as HTMLInputElement
		).value = props.item.getPID(props.type) || "";
	}, [props.type, value]);

	function handleCommit(newPid: string) {
		if (newPid != value) {
			if (props.validate && !props.validate(props.type, newPid)) {
				return;
			}
			props.item.setPID(props.type, newPid, props.autosave);
			// set new value immediately
			// if autosave is true, it will be updated twice
			// but second time (via props.item) might take some time
			setValue(props.item.getPID(props.type));
		}
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
				<input
					type="text"
					id={`pid-row-input-${props.item.key}-${props.type}`}
					className={props.editable ? "zotero-clicky" : ""}
					readOnly={!props.editable}
					defaultValue={value || ""}
					// when the input loses focus, update the item's PID
					onBlur={(event) => handleCommit(event.target.value)}
				/>
			</div>
			<button
				onClick={() => onFetch()}
				disabled={!props.item.canFetchPid(props.type)}
			>
				<img
					className={
						"cita-icon" +
						(props.item.canFetchPid(props.type) ? " pointer" : "")
					}
					title={
						props.item.canFetchPid(props.type)
							? `Fetch ${props.type}`
							: ""
					}
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
