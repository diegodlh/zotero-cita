import * as React from "react";
import * as PropTypes from "prop-types";
import Citation from "../../cita/citation";
import Wikicite from "../../cita/wikicite";

function ImportButton(props: any) {
	const citation = props.citation as Citation;
	const key = citation.target.key;
	const identifier = citation.target.getBestPID([
		"DOI",
		"arXiv",
		"ISBN",
		"OpenAlex",
	]);

	async function handleClick() {
		if (key) return; // Item was already linked and is therefore already present

		const libraryID = citation.source.item.libraryID;
		const collections = Zotero.Collections.getByLibrary(
			libraryID,
			true,
		).map((c) => {
			return { name: c.name, id: c.id };
		});
		collections.unshift({ name: "(None)", id: NaN });

		// Select collection
		const selected: { value: number } = { value: 0 };
		let selectedCollectionID: number;
		if (collections && collections.length > 1) {
			const result = Services.prompt.select(
				window as mozIDOMWindowProxy,
				"Add to collection",
				"Select a collection to which to add the item or cancel",
				collections.map((c) => c.name),
				selected,
			);

			if (result) selectedCollectionID = collections[selected.value].id;
			else return; // User cancelled the action
		} else selectedCollectionID = NaN; // No collections to choose from

		// Import from with Zotero's lookup
		if (identifier && identifier.zoteroIdentifier) {
			// Import from identifier
			const translation = new Zotero.Translate.Search();
			translation.setIdentifier(identifier.zoteroIdentifier);

			// be lenient about translators
			const translators = await translation.getTranslators();
			translation.setTranslator(translators);
			try {
				const newItems: Zotero.Item[] = await translation.translate({
					libraryID: libraryID,
					collections: Number.isNaN(selectedCollectionID)
						? false
						: [selectedCollectionID],
				});
				switch (newItems.length) {
					case 0:
						break;
					case 1: {
						const allExtraPIDTypes: PIDType[] = [
							"QID",
							"OMID",
							"OpenAlex",
							"MAG",
							"CorpusID",
							"PMID",
							"PMCID",
						];
						for (const pidType of allExtraPIDTypes) {
							const pid = citation.target.getPID(pidType);
							if (pid !== null) {
								Wikicite.setExtraField(newItems[0], pidType, [
									pid.id,
								]);
								break;
							}
						}
						citation.linkToZoteroItem(newItems[0]);
						break;
					}
					default:
						await citation.autoLink();
				}
			} catch (e: any) {
				Zotero.logError(e);
			}
		}
		// Import from OpenAlex
		else if (identifier && identifier.type === "OpenAlex") {
			const translation = new Zotero.Translate.Search();
			translation.setSearch({ openAlex: identifier.id });

			const translators = await translation.getTranslators();
			translation.setTranslator(translators);
			try {
				const newItems: Zotero.Item[] = await translation.translate({
					libraryID: libraryID,
					collections: Number.isNaN(selectedCollectionID)
						? false
						: [selectedCollectionID],
				});
				switch (newItems.length) {
					case 0:
						break;
					case 1: {
						const allExtraPIDTypes: PIDType[] = [
							"QID",
							"OMID",
							"OpenAlex",
							"MAG",
							"CorpusID",
							"PMID",
							"PMCID",
						];
						for (const pidType of allExtraPIDTypes) {
							const pid = citation.target.getPID(pidType);
							if (pid !== null) {
								Wikicite.setExtraField(newItems[0], pidType, [
									pid.id,
								]);
								break;
							}
						}
						citation.linkToZoteroItem(newItems[0]);
						break;
					}
					default:
						await citation.autoLink();
				}
			} catch (e: any) {
				Zotero.logError(e);
			}
		} else {
			// There is no identifier but we do have a JSON item
			const library = Zotero.Libraries.get(libraryID);
			if (library) {
				const newItem =
					await citation.target.item.moveToLibrary(libraryID);
				if (selectedCollectionID)
					newItem.addToCollection(selectedCollectionID);
				citation.linkToZoteroItem(newItem);
			}
		}
	}

	const title = key
		? "Already linked"
		: identifier
			? "Auto import with identifier"
			: "Import data";
	const icon = identifier ? "magic-wand" : "add-item";

	return (
		<button onClick={() => handleClick()}>
			<img
				title={title}
				src={`chrome://zotero/skin/20/universal/${icon}.svg`}
				className={"cita-icon" + (!key ? "" : " light")}
			/>
		</button>
	);
}

ImportButton.propTypes = {
	citation: PropTypes.instanceOf(Citation),
};

export default ImportButton;
