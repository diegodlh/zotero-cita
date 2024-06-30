/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import Wikicite from "./wikicite";

declare const Services: any;

export default class Extraction {
	static extract() {
		Services.prompt.alert(
			window,
			Wikicite.getString("wikicite.global.unsupported"),
			Wikicite.getString("wikicite.extract.unsupported"),
		);
	}
}
