declare const _globalThis: {
	[key: string]: any;
	Zotero: _ZoteroTypes.Zotero;
	ZoteroPane: _ZoteroTypes.ZoteroPane;
	Zotero_Tabs: typeof Zotero_Tabs;
	window: Window;
	document: Document;
	ztoolkit: ZToolkit;
	addon: typeof addon;
};

declare type ZToolkit = ReturnType<
	typeof import("../src/utils/ztoolkit").createZToolkit
>;

declare const ztoolkit: ZToolkit;

declare const rootURI: string;

declare const addon: import("../src/addon").default;

declare const __env__: "production" | "development";

declare class Localization {}

declare type PIDType =
	| "DOI"
	| "ISBN"
	| "QID"
	| "OMID"
	| "arXiv"
	| "OpenAlex"
	| "PMID"
	| "PMCID";
declare type QID = `Q${number}`;
declare type OMID = `br/${number}`;
declare type OpenAlexID = `W${number}`;
