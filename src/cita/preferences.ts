import { getPref, setPref, initialiseDefaultPref } from "../utils/prefs";

export declare type StorageType = "extra" | "note";
const STORAGE_PREF_KEY = "storage";
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
const SORT_BY_PREF_KEY = "sortBy";
export function getSortBy() {
	return getPref(SORT_BY_PREF_KEY) as SortByType;
}
export function setSortBy(value: SortByType) {
	setPref(SORT_BY_PREF_KEY, value);
}
export function initialiseSortBy() {
	initialiseDefaultPref(SORT_BY_PREF_KEY, "ordinal");
}
