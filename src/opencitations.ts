import Wikicite from './wikicite';

/* global Services */
/* global window */

export default class OpenCitations{
	static getCitations() {
        Services.prompt.alert(
            window,
            Wikicite.getString('wikicite.global.unsupported'),
            Wikicite.getString('wikicite.opencitations.get-citations.unsupported')
        );
	}

	static exportCitations() {
		Services.prompt.alert(
            window,
            Wikicite.getString('wikicite.global.unsupported'),
            Wikicite.getString('wikicite.opencitations.croci.export')
        );
	}

	static getOCC() {

	}
}
