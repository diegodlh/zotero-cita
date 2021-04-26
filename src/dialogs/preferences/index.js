/* global document, window */

const { Wikicite } = window.arguments[0];

document.title = Wikicite.getString('wikicite.prefs.title');
document.body.appendChild(
	document.createElement('p').appendChild(
		document.createTextNode(
			Wikicite.getString('wikicite.prefs.unsupported')
		)
	)
);

// ReactDOM.render();
