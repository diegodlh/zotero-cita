import { getPref, setPref, initialiseDefaultPref } from "../utils/prefs";
import Progress from "./progress";
import SourceItemWrapper from "./sourceItemWrapper";
import Wikicite, { debug } from "./wikicite";

export declare type StorageType = "extra" | "note";
export const STORAGE_PREF_KEY = "storage";
export function getStorage() {
	return getPref(STORAGE_PREF_KEY) as StorageType;
}
export function setStorage(value: StorageType) {
	setPref(STORAGE_PREF_KEY, value);
}
export function initialiseStorage() {
	initialiseDefaultPref(STORAGE_PREF_KEY, "note");
}

export declare type SortByType = "ordinal" | "authors" | "title" | "date";
export const SORT_BY_PREF_KEY = "sortBy";
export function getSortBy() {
	return getPref(SORT_BY_PREF_KEY) as SortByType;
}
export function setSortBy(value: SortByType) {
	setPref(SORT_BY_PREF_KEY, value);
}
export function initialiseSortBy() {
	initialiseDefaultPref(SORT_BY_PREF_KEY, "ordinal");
}

export const SEMANTIC_API_PREF_KEY = "semantickey";
export function getSemanticAPIKey_() {
	return getPref(SEMANTIC_API_PREF_KEY) as string;
}
export function initialiseSemanticAPIKey() {
	initialiseDefaultPref(SEMANTIC_API_PREF_KEY, "");
}

export const LINECOUNT_PREF_KEY = "linecount";
export function getLineCount() {
	return getPref(LINECOUNT_PREF_KEY) as number;
}
export function initialiseLineCount() {
	initialiseDefaultPref(LINECOUNT_PREF_KEY, 10);
}

// Functions
export async function migrateStorageLocation(
	from: StorageType,
	to: StorageType,
) {
	const progress = new Progress(
		"loading",
		Wikicite.getString(
			"wikicite.prefs.citation-storage.progress.migrating",
		),
	);
	const failedItemTitles: string[] = [];
	try {
		await Zotero.DB.executeTransaction(async function () {
			let loadedItems = 0;
			let migratedItems = 0;
			const items = (
				await Zotero.Items.getAll(Zotero.Libraries.userLibraryID)
			).filter((item: any) => item.isRegularItem());
			const wrappers = [];
			for (const item of items) {
				try {
					wrappers.push(new SourceItemWrapper(item, from));
				} catch (e) {
					debug(e as string);
					failedItemTitles.push(item.getField("title"));
				}
				progress.updateLine(
					"loading",
					Wikicite.formatString(
						"wikicite.prefs.citation-storage.progress.loaded-n-items",
						[++loadedItems, items.length],
					),
				);
			}
			if (failedItemTitles.length > 0) {
				throw new Error("Failed to migrate some items");
			}
			for (const wrapper of wrappers) {
				await wrapper.migrateCitations(to);
				progress.updateLine(
					"loading",
					Wikicite.formatString(
						"wikicite.prefs.citation-storage.progress.migrated-n-items",
						[++migratedItems, items.length],
					),
				);
			}
			setStorage(to);
		});
		progress.updateLine(
			"done",
			Wikicite.getString("wikicite.prefs.citation-storage.progress.done"),
		);
	} catch (e) {
		debug(e as string);
		progress.updateLine(
			"error",
			Wikicite.getString(
				"wikicite.prefs.citation-storage.progress.failed",
			),
		);
	} finally {
		progress.close();
	}

	if (failedItemTitles.length != 0) {
		const message =
			Wikicite.getString(
				"wikicite.prefs.citation-storage.alert.failed-explanation",
			) +
			"\n" +
			failedItemTitles.map((title) => `• ${title}`).join("\n");
		Services.prompt.alert(
			window as mozIDOMWindowProxy,
			Wikicite.getString("wikicite.prefs.citation-storage.alert.failed"),
			message,
		);
	}
}
