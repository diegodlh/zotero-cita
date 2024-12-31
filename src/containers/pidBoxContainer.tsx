import * as React from "react";
import { useEffect, useState } from "react";
import SourceItemWrapper from "../cita/sourceItemWrapper.js";
import * as prefs from "../cita/preferences";
import { ErrorBoundary } from "react-error-boundary";
import PIDBox from "../components/itemPane/pidBox.js";
import "core-js/proposals/set-methods-v2";
import PID from "../cita/PID.js";

function PIDBoxContainer(props: {
	item: Zotero.Item;
	editable: boolean;
	tabID: string;
	setSectionButtonStatus: (hidden: boolean) => void;
}) {
	const [sourceItem, setSourceItem] = useState(
		// If the initial state is the result of an expensive computation,
		// one may provide a function instead, which will be executed only on the initial render.
		() => new SourceItemWrapper(props.item, prefs.getStorage()),
	);

	// PID visibility state (single source of truth)
	// Display all PIDs that are showable, available, and valid for the item type, as well as those that should always be shown
	const [shownPIDs, setShownPIDs] = useState(sourceItem.allTypesToShow);

	// Reset shownPIDs when the item type changes
	const [prevType, setPrevType] = useState(sourceItem.type);
	if (sourceItem.type !== prevType) {
		setPrevType(sourceItem.type);
		setShownPIDs(sourceItem.allTypesToShow);
	}

	useEffect(() => {
		const observer = {
			notify: async function (
				action: any,
				type: string,
				ids: string[] | number[],
				extraData: any,
			) {
				// This observer will be triggered as long as the component remains mounted
				// That is, until the item selected changes.
				if (type === "item") {
					const notes = Zotero.Items.get(ids).filter((item) =>
						item.isNote(),
					);
					if (
						// todo: this as number[] fixes TS error
						(ids as number[]).includes(props.item.id) ||
						notes
							.map((note) => note.parentID)
							.includes(props.item.id)
					) {
						// debug("Item observer has been triggered...");
						// This may cause two re-renders: one when sourceItem is reset,
						// and another after sourceItem-dependent useEffect run above is run.
						setSourceItem(
							new SourceItemWrapper(
								props.item,
								prefs.getStorage(),
							),
						);
					}
				}
			},
		};

		const id = Zotero.Notifier.registerObserver(
			observer,
			["item"],
			"pidBox",
		);

		return function cleanup() {
			Zotero.Notifier.unregisterObserver(id);
		};
	}, [props.item]);

	function addPIDRow(pidType: PIDType) {
		const currentSet = shownPIDs;
		currentSet.add(pidType);

		// We do this in a roundabout way to preserve the order of the PID rows (because the sets are actually ordered)
		const newSet = PID.showable.difference(
			PID.showable.difference(currentSet),
		);
		setShownPIDs(newSet);
	}

	// Manage the PID add menu
	useEffect(() => {
		const remainingShowablePIDs = sourceItem.validPIDTypes
			.intersection(PID.showable)
			.difference(shownPIDs);

		const pidAddMenu = document.getElementById(
			"pid-row-add-menu-" + props.tabID,
		);
		if (pidAddMenu) {
			// Remove all existing menu items
			while (pidAddMenu.firstChild) {
				pidAddMenu.removeChild(pidAddMenu.firstChild);
			}

			// Add a menu item for each PID type that is showable but not yet shown
			for (const pidType of remainingShowablePIDs) {
				const menuItem = document.createXULElement("menuitem");
				menuItem.setAttribute("label", pidType);
				menuItem.addEventListener("command", () => {
					addPIDRow(pidType);
				});
				pidAddMenu.appendChild(menuItem);
			}
		}

		// Hide the add-pid button if no PIDs are left to show
		const hideMenu = remainingShowablePIDs.size === 0;
		props.setSectionButtonStatus(hideMenu);
	}, [shownPIDs]);

	return (
		<ErrorBoundary
			fallback={<div>Something went wrong</div>}
			onError={(error, info) =>
				Zotero.log(`Error: ${error}, Info: ${info}`, "error")
			}
		>
			<PIDBox
				editable={props.editable}
				autosave={true}
				item={sourceItem}
				shownPIDs={shownPIDs}
				setShownPIDs={setShownPIDs}
				checkPID={(type, value, options) => {
					return sourceItem.checkPID(type, value, options);
				}}
			/>
		</ErrorBoundary>
	);
}

export default PIDBoxContainer;
