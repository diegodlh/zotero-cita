import Wikicite from './wikicite';

/* global Services */
/* global window */

export default class Extraction{
	static extract() {
        Services.prompt.alert(
            window,
            Wikicite.getString('wikicite.global.unsupported'),
            Wikicite.getString('wikicite.extract.unsupported')
        );
	}
}
