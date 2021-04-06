import Wikicite from '../../wikicite';

/* global document */

document.title = Wikicite.getString('wikicite.prefs.title');
document.body.appendChild(
	document.createElement('p').appendChild(
		document.createTextNode(
			Wikicite.getString('wikicite.prefs.unsupported')
		)
	)
);

// ReactDOM.render();
