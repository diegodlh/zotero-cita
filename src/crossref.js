import Wikicite from './wikicite';

/* global Services */
/* global window */

export default class Crossref{
	static getCitations() {
        Services.prompt.alert(
            window,
            Wikicite.getString('wikicite.global.unsupported'),
            Wikicite.getString('wikicite.crossref.getCitations.unsupported')
        );
	}

	static getDOI() {

	}
}
