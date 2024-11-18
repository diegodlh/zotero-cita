/* License */
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import ItemWrapper from "../cita/itemWrapper";
import Wikicite, { debug } from "../cita/wikicite";
import PID from "../cita/PID";
import ToolbarButton from "./itemPane/toolbarButton";

interface PIDRowProps {
	autosave: boolean;
	editable: boolean;
	item: ItemWrapper;
	type: PIDType;
	pidTypes: PIDType[];
	pidDidChange?: () => void;
	validate: (type: PIDType, value: string) => boolean;
}

function PIDRow(props: PIDRowProps) {
	const [value, setValue] = useState(props.item.getPID(props.type));
	const [url, setUrl] = useState(props.item.getPidUrl(props.type));
	const inputRef = useRef<HTMLInputElement>(null);
	const rowRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setValue(props.item.getPID(props.type));
	}, [props.item, props.type]);

	useEffect(() => {
		setUrl(props.item.getPidUrl(props.type));
		// update the value of the input to match the new PID
		if (inputRef.current) {
			inputRef.current.value = props.item.getPID(props.type)?.id || "";
		}
	}, [props.type, value]);

	function handleCommit(newPid: string) {
		if (newPid !== value?.id) {
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

	function deletePid() {
		handleCommit("");
		props.pidDidChange?.();
	}

	async function onFetch(e: React.MouseEvent) {
		await props.item.fetchPID(props.type, props.autosave);
		// set new value immediately (see note in handleCommit)
		setValue(props.item.getPID(props.type));
	}

	async function onOpenLink(url: string, e: React.MouseEvent) {
		Zotero.launchURL(url);
	}

	// show the row if the PID has a value, the type is QID, or DOI is a valid field
	const showRow =
		value ||
		props.type === "QID" ||
		(props.type === "DOI" && props.item.isValidField(props.type));

	return (
		<div
			className={`meta-row${showRow ? "" : " hidden"}`}
			id={`pid-row-${props.type}`}
			ref={rowRef}
		>
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
						defaultValue={value?.id || ""}
						// when the input loses focus, update the item's PID
						onBlur={(event) => handleCommit(event.target.value)}
					/>,
				)}
				<ToolbarButton
					className="zotero-clicky zotero-clicky-minus show-on-hover no-display"
					tabIndex={0}
					onClick={deletePid}
					title={Zotero.getString("general.remove")}
					imgSrc="chrome://zotero/skin/16/universal/minus-circle.svg"
				/>
				{/*props.pidTypes.some(
					(pidType: PIDType) =>
						props.item.getPID(pidType) == null &&
						!["QID", "DOI"].includes(pidType),
				) && (
					<ToolbarButton
						className="zotero-clicky zotero-clicky-plus show-on-hover no-display"
						tabIndex={0}
						onClick={(event: React.MouseEvent) => {
							event.preventDefault();
							(
								document.getElementById(
									"pid-row-add-menu",
								) as unknown as XULMenuPopupElement
							)?.openPopupAtScreen(
								window.screenX + event.clientX,
								window.screenY + event.clientY,
								true,
							);
						}}
						title={Zotero.getString("general.create")}
						imgSrc="chrome://zotero/skin/16/universal/plus-circle.svg"
					/>
				)*/}
				{props.item.canFetchPid(props.type) && !value?.id && (
					<ToolbarButton
						className="zotero-clicky show-on-hover no-display"
						tabIndex={0}
						onClick={onFetch}
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
