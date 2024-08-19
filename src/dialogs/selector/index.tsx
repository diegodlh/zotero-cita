import Selector from "./Selector";
import * as React from "react";
import { createRoot } from "react-dom/client";
import Wikicite from "../../cita/wikicite";

let choices: string[];
let message: string;
({
	choices: choices,
	message,
	addon: window.addon,
} = (window as any).arguments[0]);
const retVals: { value?: number } = (window as any).arguments[1];

function onCancel() {
	window.close();
}

function onConfirm() {
	retVals.value = (
		document.getElementById("selector-list") as HTMLSelectElement
	).selectedIndex;
	window.close();
}

window.addEventListener("load", () => {
	document.title = Wikicite.getString(
		"wikicite.wikidata.reconcile.approx.title",
	);
	const root = createRoot(document.getElementById("root")!);
	root.render(
		<Selector
			choices={choices}
			message={message}
			getString={(name) => Wikicite.getString(name)}
			onCancel={onCancel}
			onConfirm={onConfirm}
		/>,
	);
});
