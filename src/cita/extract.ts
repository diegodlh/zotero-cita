import Wikicite from "./wikicite";

export default class Extraction {
	static extract() {
		Services.prompt.alert(
			window as mozIDOMWindowProxy,
			Wikicite.getString("wikicite.global.unsupported"),
			Wikicite.getString("wikicite.extract.unsupported"),
		);
	}
}
