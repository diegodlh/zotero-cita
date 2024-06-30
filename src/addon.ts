import { ColumnOptions } from "zotero-plugin-toolkit/dist/helpers/virtualizedTable";
import { DialogHelper } from "zotero-plugin-toolkit/dist/helpers/dialog";
import hooks from "./hooks";
import WikiciteChrome from "./cita/wikiciteChrome";
import zoteroOverlay from "./cita/zoteroOverlay";
import { createZToolkit } from "./utils/ztoolkit";

class Addon {
	public data: {
		alive: boolean;
		// Env type, see build.js
		env: "development" | "production";
		ztoolkit: ZToolkit;
		locale?: {
			current: any;
		};
		prefs?: {
			window: Window;
			columns: Array<ColumnOptions>;
			rows: Array<{ [dataKey: string]: string }>;
		};
		dialog?: DialogHelper;
	};
	// Lifecycle hooks
	public hooks: typeof hooks;
	public wikiciteChrome: typeof WikiciteChrome;
	public wikiciteZoteroOverlay: typeof zoteroOverlay;
	// APIs
	public api: object;

	constructor() {
		this.data = {
			alive: true,
			env: __env__,
			ztoolkit: createZToolkit(),
		};
		this.hooks = hooks;
		this.wikiciteChrome = WikiciteChrome;
		this.wikiciteZoteroOverlay = zoteroOverlay;
		this.wikiciteZoteroOverlay.init();
		this.api = {};
	}
}

export default Addon;
