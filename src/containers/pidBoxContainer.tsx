import * as React from "react";
import { useEffect, useState } from "react";
import SourceItemWrapper from "../cita/sourceItemWrapper.js";
import * as prefs from "../cita/preferences";
import { config } from "../../package.json";
import { ErrorBoundary } from "react-error-boundary";
import PIDBox from "../components/itemPane/pidBox.js";

function PIDBoxContainer(props: {
	item: Zotero.Item;
	editable: boolean;
	onPIDChange: (hidden: boolean) => void;
}) {
	const [sourceItem, setSourceItem] = useState(
		// If the initial state is the result of an expensive computation,
		// one may provide a function instead, which will be executed only on the initial render.
		() => new SourceItemWrapper(props.item, prefs.getStorage()),
	);

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

	useEffect(() => {
		Zotero[config.addonInstance].data.zoteroOverlay.setSourceItem(
			sourceItem,
		);
	}, [sourceItem]);

	return (
		<ErrorBoundary
			fallback={<div>Something went wrong</div>}
			onError={(error, info) =>
				Zotero.log(`Error: ${error}, Info: ${info}`, "error")
			}
		>
			<PIDBox
				editable={props.editable}
				sourceItem={sourceItem}
				onPIDChange={props.onPIDChange}
			/>
		</ErrorBoundary>
	);
}

export default PIDBoxContainer;
