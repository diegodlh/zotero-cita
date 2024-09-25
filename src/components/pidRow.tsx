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

	const [oldPid, setOldPid] = useState(value);

	useEffect(() => {
		setValue(props.item.getPID(props.type));
	}, [props.item, props.type]);

	useEffect(() => {
		setUrl(props.item.getPidUrl(props.type));
	}, [props.type, value]);

	function handleCommit(newPid: string) {
		if (newPid != oldPid) {
			if (props.validate && !props.validate(props.type, newPid)) {
				setValue(oldPid);
				return;
			}
			props.item.setPID(props.type, newPid, props.autosave);
		}
	}

	async function onFetch() {
		await props.item.fetchPID(props.type, props.autosave);
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
					className={props.editable ? "zotero-clicky" : ""}
					readOnly={!props.editable}
					value={value || ""}
					onChange={(event) => setValue(event.target.value)}
					// when the input gains focus, save its value for reference
					onFocus={() => setOldPid(value || "")}
					// when the input loses focus, update the item's PID
					onBlur={(event) => handleCommit(event.target.value)}
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
