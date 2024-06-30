/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import Wikicite from "./wikicite";

declare const Services: any;

export default class OpenCitations {
	static getCitations() {
		Services.prompt.alert(
			window,
			Wikicite.getString("wikicite.global.unsupported"),
			Wikicite.getString(
				"wikicite.opencitations.get-citations.unsupported",
			),
		);
	}

	static exportCitations() {
		Services.prompt.alert(
			window,
			Wikicite.getString("wikicite.global.unsupported"),
			Wikicite.getString("wikicite.opencitations.croci.export"),
		);
	}

	static getOCC() {}
}
