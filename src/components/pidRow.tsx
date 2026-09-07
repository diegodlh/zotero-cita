/* License */
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import ItemWrapper from "../cita/itemWrapper";
import Wikicite from "../cita/wikicite";
import PID from "../cita/PID";
import ToolbarButton from "./itemPane/toolbarButton";

interface PIDRowProps {
	autosave: boolean;
	editable: boolean;
	item: ItemWrapper;
	type: PIDType; // is used as a key
	removePIDRow: (type: PIDType) => void;
	validate: (type: PIDType, value: string) => boolean;
	isCitationEditor: boolean;
}

function PIDRow(props: PIDRowProps) {
	const [pidValue, setPIDValue] = useState(props.item.getPID(props.type));

	const url = pidValue?.url;
	const inputRef = useRef<HTMLInputElement>(null);
	const [invalidValue, setInvalidValue] = useState<string | null>(null);

	useEffect(() => {
		setPIDValue(props.item.getPID(props.type));
	}, [props.item, props.type]);

	useEffect(() => {
		// update the value of the input to match the new PID
		if (inputRef.current) {
			// Show cleaned ID when available; show empty string for null
			inputRef.current.value = pidValue?.cleanID ?? "";
		}
	}, [pidValue]);

	function handleCommit(newPid: string, checkValid: boolean = true) {
		if (newPid !== pidValue?.id) {
			if (
				checkValid &&
				props.validate &&
				!props.validate(props.type, newPid)
			) {
				setInvalidValue(newPid);
				return;
			}
			props.item.setPID(props.type, newPid, props.autosave);
			// set new value immediately
			// if autosave is true, it will be updated twice
			// but second time (via props.item) might take some time
			setPIDValue(props.item.getPID(props.type));
			setInvalidValue(null);
		}
	}

	function handleChange(newPid: string) {
		// If the user previously entered an invalid value - it will be red
		// check if they've made it valid, then don't show it red anymore
		if (invalidValue !== null) {
			if (props.validate && props.validate(props.type, newPid)) {
				setInvalidValue(null);
			}
		}
	}

	function deletePID() {
		handleCommit("", false);
		props.removePIDRow(props.type);
	}

	async function onFetch(e: React.MouseEvent) {
		await props.item.fetchPID(
			props.type,
			props.autosave,
			props.isCitationEditor,
		);
		setPIDValue(props.item.getPID(props.type));
		setInvalidValue(null);
	}

	async function onOpenLink(url: string, e: React.MouseEvent) {
		Zotero.launchURL(url);
	}

	const displayText =
		invalidValue !== null ? invalidValue : (pidValue?.cleanID ?? "");

	return (
		<div className={`meta-row`} id={`pid-row-${props.type}`}>
			<div className="meta-label">
				<label className="key pid-label">{props.type}</label>
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
						ref={inputRef}
						type="text"
						id={`pid-row-input-${props.item.key}-${props.type}`}
						className={props.editable ? "input" : ""}
						readOnly={!props.editable}
						defaultValue={displayText}
						style={{
							color:
								invalidValue !== null
									? "var(--accent-red)"
									: undefined,
						}}
						// when the input loses focus, update the item's PID
						onBlur={(event) => {
							handleCommit(event.target.value);
						}}
						// check if PID was invalid but becomes valid
						onChange={(event) => {
							handleChange(event.target.value);
						}}
					/>,
				)}
				<ToolbarButton
					className="zotero-clicky zotero-clicky-minus show-on-hover no-display"
					tabIndex={0}
					onClick={deletePID}
					title={
						PID.alwaysShown.has(props.type)
							? Zotero.getString("general.delete")
							: Zotero.getString("general.remove")
					}
					imgSrc="chrome://zotero/skin/16/universal/minus-circle.svg"
				/>
				{props.item.canFetchPid(props.type) && !pidValue?.id && (
					<ToolbarButton
						className="zotero-clicky show-on-hover no-display"
						tabIndex={0}
						onClick={(e) => onFetch(e)}
						title={Wikicite.formatString(
							"wikicite.citations-pane.pid-row.fetch-pid",
							props.type,
						)}
						imgSrc={`chrome://zotero/skin/20/universal/magnifier.svg`}
					/>
				)}
				{url && (
					<ToolbarButton
						className="zotero-clicky zotero-clicky-open-link show-on-hover no-display"
						tabIndex={0}
						onClick={(e) => onOpenLink(url, e)}
						imgSrc="chrome://zotero/skin/16/universal/open-link.svg"
						title={Zotero.getString("view-online")}
					/>
				)}
			</div>
		</div>
	);
}

export default PIDRow;
