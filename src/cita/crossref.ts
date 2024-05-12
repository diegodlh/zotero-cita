import Wikicite from './wikicite';

declare const Services: any;

export default class Crossref{
	static getCitations() {
        Services.prompt.alert(
            window,
            Wikicite.getString('wikicite.global.unsupported'),
            Wikicite.getString('wikicite.crossref.get-citations.unsupported')
        );
	}

	static getDOI() {

	}
}
