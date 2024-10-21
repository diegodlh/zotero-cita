/* License */
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import * as PropTypes from "prop-types";
import ItemWrapper from "../cita/itemWrapper";
import Wikicite, { debug } from "../cita/wikicite";
import PID from "../cita/PID";

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
		).value = props.item.getPID(props.type)?.id || "";
	}, [props.type, value]);

	function handleCommit(newPid: string) {
		if (newPid != value?.id) {
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
		<div
			className={
				"meta-row" +
				(value == null && !["QID", "DOI"].includes(props.type)
					? " hidden"
					: "")
			}
			id={`pid-row-${props.type}`}
		>
			<div className="meta-label">
				<label className={"key pid-label"}>{props.type}</label>
			</div>
			<div className="meta-data">
				{React.createElement(
					"editable-text",
					{
						class: "value",
						nowrap: "true",
						tight: "true",
						style: { textAlign: "left" },
					},
					<input
						type="text"
						id={`pid-row-input-${props.item.key}-${props.type}`}
						className={props.editable ? "input" : ""}
						readOnly={!props.editable}
						defaultValue={value?.id || ""}
						// when the input loses focus, update the item's PID
						onBlur={(event) => handleCommit(event.target.value)}
					/>,
				)}
				{props.item.canFetchPid(props.type) &&
					React.createElement(
						"toolbarbutton",
						{
							className: "zotero-clicky show-on-hover no-display",
							tabIndex: 0,
							onClick: () => onFetch(),
						},
						<img
							className={
								"toolbarbutton-icon" +
								(props.item.canFetchPid(props.type)
									? " pointer"
									: "")
							}
							src={`chrome://zotero/skin/16/universal/sync.svg`}
							title={Wikicite.formatString(
								"wikicite.citations-pane.pid-row.fetch-pid",
								props.type,
							)}
						/>,
					)}
				{url &&
					React.createElement(
						"toolbarbutton",
						{
							className:
								"zotero-clicky zotero-clicky-open-link show-on-hover no-display",
							tabIndex: 0,
							onClick: () => Zotero.launchURL(url),
						},
						<img
							className={"toolbarbutton-icon"}
							src={`chrome://zotero/skin/16/universal/open-link.svg`}
							title={Zotero.getString("view-online")}
						/>,
					)}
			</div>
		</div>
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
