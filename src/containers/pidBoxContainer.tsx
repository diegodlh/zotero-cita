import * as React from "react";
import { useEffect, useState } from "react";
import SourceItemWrapper from "../cita/sourceItemWrapper.js";
import * as prefs from "../cita/preferences";
import { config } from "../../package.json";
import { ErrorBoundary } from "react-error-boundary";
import PIDBox from "../components/itemPane/pidBox.js";
import "core-js/proposals/set-methods-v2";
import PID from "../cita/PID.js";
import ZoteroOverlay from "../cita/zoteroOverlay.js";

function PIDBoxContainer(props: {
	item: Zotero.Item;
	editable: boolean;
	onNoPIDsLeftToShow: (hidden: boolean) => void;
}) {
	const [sourceItem, setSourceItem] = useState(
		// If the initial state is the result of an expensive computation,
		// one may provide a function instead, which will be executed only on the initial render.
		() => new SourceItemWrapper(props.item, prefs.getStorage()),
	);

	// PID visibility state (single source of truth)
	const [shownPIDs, setShownPIDs] = useState(new Set<PIDType>());

	// Display all PIDs that are showable, available, and valid for the item, as well as those that should always be shown
	useEffect(() => {
		const initialShown = PID.alwaysShown.union(
			PID.showable.intersection(sourceItem.validAvailablePIDTypes),
		);
		setShownPIDs(initialShown);
	}, [sourceItem]);

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

	// Sync state with Zotero overlay
	useEffect(() => {
		const zoteroOverlay = Zotero[config.addonInstance].data
			.zoteroOverlay as ZoteroOverlay;
		zoteroOverlay.setShownPIDs(shownPIDs);

		// Register a callback to sync overlay changes back to React.
		const handlePIDChange = (updatedShownPIDs: Set<PIDType>) => {
			setShownPIDs(new Set(updatedShownPIDs)); // Update React state with overlay changes.
		};

		zoteroOverlay.onPIDChange(handlePIDChange);

		// We handle the case where no PIDs are left to show in the PIDBox component itself
		const noPIDsLeftToShow =
			sourceItem.validPIDTypes
				.intersection(PID.showable)
				.difference(shownPIDs).size === 0;
		props.onNoPIDsLeftToShow(noPIDsLeftToShow);

		return () => {
			// Cleanup if necessary
			zoteroOverlay.onPIDChange(undefined); // Deregister callback when component unmounts.
		};
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
