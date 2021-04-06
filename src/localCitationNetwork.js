import Wikicite from './wikicite';

/* global Services */
/* global window */

export default class LCN{
	static show() {
        Services.prompt.alert(
            window,
            Wikicite.getString('wikicite.global.unsupported'),
            Wikicite.getString('wikicite.lcn.show.unsupported')
        );
	}
}
