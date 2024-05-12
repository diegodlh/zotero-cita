import Wikicite from "./wikicite";

declare const Zotero: any;

const icons = new Map([
	["loading", "chrome://zotero/skin/arrow_refresh.png"],
	["done", "chrome://zotero/skin/tick.png"],
]);

const delay = 3000;

export default class Progress {
	progressWin: any;
	progress: any[];
	constructor(status?: string, message?: string) {
		// Fixme: there seems to be a bug with Zotero.ProgressWindow if
		// closeOnClick=false. Apparently, if one does click on the little
		// window while the close timer is running, then the window never
		// closes. Confirm and report to Zotero. Meanwhile, as workaround,
		// setting to default true.
		this.progressWin = new Zotero.ProgressWindow({ closeOnClick: true });
		this.progressWin.changeHeadline(
			Wikicite.getString("wikicite.global.name"),
			"chrome://cita/skin/cita.png",
		);
		this.progressWin.show();
		this.progress = [];
		if (status || message) {
			this.newLine(status, message);
		}
	}

	newLine(status?: string, message?: string) {
		const progress = new this.progressWin.ItemProgress(
			status ? icons.get(status) : "",
			message,
		);
		progress.setProgress(100);
		if (status === "error") {
			progress.setError();
		}
		this.progress.push(progress);
	}

	updateLine(status?: string, message?: string) {
		const progress = this.progress.slice(-1)[0];
		if (status === "error") {
			progress.setError();
		}
		if (status) {
			const icon = icons.get(status);
			if (icon) {
				progress.setIcon(icon);
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
