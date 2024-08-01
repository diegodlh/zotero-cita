import Wikicite from "./wikicite";

const icons = new Map([
	["loading", "chrome://zotero/skin/arrow_refresh.png"],
	["done", "chrome://zotero/skin/tick.png"],
]);

const css = `
.icon-css.icon-cita {
	background:url("chrome://zotero-wikicite/content/skin/default/cita.svg") no-repeat center/contain;
}
.icon-css.icon-loading {
	background:url("chrome://zotero/skin/arrow_refresh.png") no-repeat center/contain;
}
.icon-css.icon-done {
	background:url("chrome://zotero/skin/tick.png") no-repeat center/contain;
}
`;

type StatusType = "error" | "done" | "loading";

const delay = 3000;

export default class Progress {
	progressWin: Zotero.ProgressWindow;
	progress: Zotero.ItemProgress[];
	setStyleSheet = false;
	constructor(status?: StatusType, message?: string) {
		// Fixme: there seems to be a bug with Zotero.ProgressWindow if
		// closeOnClick=false. Apparently, if one does click on the little
		// window while the close timer is running, then the window never
		// closes. Confirm and report to Zotero. Meanwhile, as workaround,
		// setting to default true.
		this.progressWin = new Zotero.ProgressWindow({ closeOnClick: true });
		this.progressWin.changeHeadline(
			Wikicite.getString("wikicite.global.name"),
			"cita",
		);
		this.progressWin.show();
		this.progress = [];
		if (typeof status != "undefined" || typeof message != "undefined") {
			this.newLine(status, message);
		}
	}

	async addStyleSheetToProgressWindow(progress: Zotero.ItemProgress) {
		// this is a hack to add custom icons into the CSS
		// see https://github.com/zotero/zotero/pull/4047
		await this.waitForItemProgressReady(progress);
		await this.waitForItemProgressParentReady(progress);

		// @ts-ignore new version of Progress
		const progressWindow = progress._image.parentElement?.parentElement
			?.parentElement as unknown as Window;

		const styleSheet = document.createElement("style");
		styleSheet.innerText = css;
		progressWindow.appendChild(styleSheet);
	}

	async waitForItemProgressReady(progress: Zotero.ItemProgress) {
		return new Promise<void>((resolve) => {
			// @ts-ignore new version of Progress
			if (typeof progress._image !== "undefined") {
				resolve();
			} else {
				Object.defineProperty(progress, "_image", {
					configurable: true,
					set(v) {
						Object.defineProperty(progress, "_image", {
							configurable: true,
							enumerable: true,
							writable: true,
							value: v,
						});
						resolve();
					},
				});
			}
		});
	}

	async waitForItemProgressParentReady(progress: Zotero.ItemProgress) {
		return new Promise<void>((resolve) => {
			// @ts-ignore new version of Progress
			if (progress._image.parentElement != null) {
				resolve();
			} else {
				// @ts-ignore new version of Progress
				Object.defineProperty(progress._image, "parentElement", {
					configurable: true,
					set(v) {
						Object.defineProperty(
							// @ts-ignore new version of Progress
							progress._image,
							"parentElement",
							{
								configurable: true,
								enumerable: true,
								writable: true,
								value: v,
							},
						);
						resolve();
					},
				});
			}
		});
	}

	newLine(status?: StatusType, message?: string) {
		// @ts-ignore new version of Progress
		const progress = new this.progressWin.ItemProgress(null, message || "");

		// append the stylesheet the first time this loads...
		if (!this.setStyleSheet) {
			this.setStyleSheet = true;
			this.addStyleSheetToProgressWindow(progress);
		}

		progress.setProgress(100);
		if (status) {
			// @ts-ignore new version of Progress
			progress.setItemTypeAndIcon(null, status);
			if (status === "error") {
				// need to call setItemTypeAndIcon before setError or error icon won't show
				progress.setError();
			}
		}
		this.progress.push(progress);
	}

	updateLine(status?: StatusType, message?: string) {
		const progress = this.progress.slice(-1)[0];
		if (status) {
			// @ts-ignore new version of Progress
			progress.setItemTypeAndIcon(null, status);
			if (status === "error") {
				// need to call setItemTypeAndIcon before setError or error icon won't show
				progress.setError();
			}
		}
		if (message) {
			progress.setText(message);
		}
	}

	close() {
		this.progressWin.startCloseTimer(delay);
	}
}
