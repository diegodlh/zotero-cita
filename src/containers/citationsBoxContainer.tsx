import * as React from "react";
import { useEffect, useState } from "react";
import CitationsBox from "../components/itemPane/citationsBox.js";
import SourceItemWrapper from "../cita/sourceItemWrapper.js";
import * as prefs from "../cita/preferences";
import { config } from "../../package.json";
import { getPrefGlobalName } from "../utils/prefs.js";
import { ErrorBoundary } from "react-error-boundary";

function CitationsBoxContainer(props: {
	item: Zotero.Item;
	editable: boolean;
	onCountChange: (count: number) => void;
}) {
	// debug("CitationsBoxContainer will render...");

	// this CitationsBox container knows about the current
	// sortBy preference value
	const [sortBy, setSortBy] = useState(() => prefs.getSortBy());
	const [maxLineCount, setMaxLineCount] = useState(() =>
		prefs.getLineCount(),
	);

	// fix: this one was being used
	// Option 1, include sourceItem in component's internal state.
	// Con: The component will re-render every time the sourceItem is reinstantiated.
	const [sourceItem, setSourceItem] = useState(
		// If the initial state is the result of an expensive computation,
		// one may provide a function instead, which will be executed only on the initial render.
		() => new SourceItemWrapper(props.item, prefs.getStorage()),
	);

	// Option 2, set sourceItem as an instance-like variable with useRef.
	// Con: The component will not notice when sourceItem is reinstantiated.
	// And passing sourceItem.current as useEffect dependency is bad idea
	// https://github.com/facebook/react/issues/14387#issuecomment-503616820
	// const sourceItem = useRef(
	//   new SourceItemWrapper(props.item, window.Wikicite.Prefs.get('storage'))
	// );

	// Option 3, set sourceItem as an instance-like variable with useCallback.
	// Pro: A callback should run when the ref is updated. The callback would update the state.
	// https://github.com/facebook/react/issues/14387#issuecomment-503616820
	// Con: Doesn't seem to work as expected - the ref lacks a `current` property.
	// const sourceItem = useCallback((sourceItem) => {
	//   console.log('Running callback...');
	//   setCitations(sourceItem.citations);
	// }, []);
	// sourceItem.current = new SourceItemWrapper(props.item, window.Wikicite.Prefs.get('storage'));

	// I don't need a create button next to wikicite field
	// I only have a fetch button. If when fetching no item is found
	// i may offer to create one. But nowhere else.
	// same thing would apply for the editing target items in the citation editor
	// this fetch button calls Wikidata.getQID. A confirmation dialog saying what's
	// gonna happen may have a select option to "also download ciation information from wikidata"
	// calling getQID with getCitations=true

	// In addition to the Wikidata QID field, there will be a DOI field, and maybe a ISBN too
	// This is gonna be the UID area. The providers area
	// I can easily try and fetch a QID or DOI for my source item here
	// only for WIkidata an option to create one if not found will be offered (basic functionality)
	// it is next to these that a "get citations from crossref/wikidata/etc" option will be offered as well
	// or a sync button (but only wikidata will be back and forth)
	// well, actually the forth of DOI may be export in CROCI format
	// get citations from crossref for this DOI / export citations to CROCI for this DOI
	// get citations from Wikidata for this QID / sync citations to Wikidata for this QID
	// OMID (OpenCitations Metadata ID) makes sense too, because OCI may relate two interanal OC corpus ids

	useEffect(() => {
		// debug("First run, or props.item has changed");
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
						// If sourceItem is a ref, state must be updated from here,
						// because including sourceItem.current in a useEffect dependency array won't work
						// https://github.com/facebook/react/issues/14387#issuecomment-503616820
						// However, this would cause multiple component re-renders
						// https://stackoverflow.com/questions/59163378/react-hooks-skip-re-render-on-multiple-consecutive-setstate-calls
						// setCitations(sourceItem.current.citations);
						// setDoi(props.item.getField("DOI"));
						// setOcc(
						// 	Wikicite.getExtraField(
						// 		props.item.getField("extra"),
						// 		"occ",
						// 	),
						// );
						// setQid(
						// 	Wikicite.getExtraField(
						// 		props.item.getField("extra"),
						// 		"qid",
						// 	),
						// );
						// fix: not sure why this was if (false)?
					}
					// } else if (false) {
					// 	// I have to check if the target item of one of the linked citations has been modified
					// 	setSourceItem(
					// 		new SourceItemWrapper(
					// 			props.item,
					// 			prefs.getStorage(),
					// 		),
					// 	);
					// }
				}
			},
		};

		const id = Zotero.Notifier.registerObserver(
			observer,
			["item"],
			"citationsBox",
		);

		return function cleanup() {
			Zotero.Notifier.unregisterObserver(id);
		};
	}, [props.item]);

	useEffect(() => {
		// single-run effect to register listeners for preference-change topics
		const sortByObserver = Zotero.Prefs.registerObserver(
			getPrefGlobalName(prefs.SORT_BY_PREF_KEY),
			(value: prefs.SortByType) => {
				setSortBy(value);
			},
			true,
		);
		const lineCountObserver = Zotero.Prefs.registerObserver(
			getPrefGlobalName(prefs.LINECOUNT_PREF_KEY),
			(value: number) => {
				setMaxLineCount(value);
			},
			true,
		);
		return () => {
			Zotero.Prefs.unregisterObserver(sortByObserver);
			Zotero.Prefs.unregisterObserver(lineCountObserver);
		};
	}, []);

	useEffect(() => {
		Zotero[config.addonInstance].data.zoteroOverlay.setSourceItem(
			sourceItem,
		);
	}, [sourceItem]);

	// Keep citation count up to date
	useEffect(() => {
		props.onCountChange(sourceItem.citations.length);
	}, [sourceItem.citations.length]);

	/**
	 * Display citing-item actions pop-up menu at the event's coordinates
	 */
	function handleItemPopup(event: React.MouseEvent) {
		const itemPopupMenu = document.getElementById(
			"citations-box-item-menu",
		) as unknown as XULMenuPopupElement;
		event.preventDefault();
		itemPopupMenu.openPopupAtScreen(
			window.screenX + event.clientX,
			window.screenY + event.clientY,
			true,
		);
	}

	function handleCitationPopup(
		event: React.MouseEvent,
		citationIndex: number,
	) {
		// fix: how to access this?
		Zotero[config.addonInstance].data.zoteroOverlay.setCitationIndex(
			citationIndex,
		);
		const citationPopupMenu = document.getElementById(
			"citations-box-citation-menu",
		) as unknown as XULMenuPopupElement;
		citationPopupMenu.openPopup(event.target as Element);
	}

	return (
		<ErrorBoundary
			fallback={<div>Something went wrong</div>}
			onError={(error, info) =>
				Zotero.log(`Error: ${error}, Info: ${info}`, "error")
			}
		>
			<CitationsBox
				editable={props.editable}
				sortBy={sortBy}
				maxLineCount={maxLineCount}
				sourceItem={sourceItem}
				onItemPopup={handleItemPopup}
				onCitationPopup={handleCitationPopup}
			/>
		</ErrorBoundary>
	);
}

export default CitationsBoxContainer;
