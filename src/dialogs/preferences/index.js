import PreferenceDialog from './PreferenceDialog';
import React from 'react';
import ReactDOM from 'react-dom';

/* global document, window */

const { Wikicite, Prefs } = window.arguments[0];

document.title = Wikicite.getString('wikicite.prefs.title');
ReactDOM.render(
    <PreferenceDialog
        formatString={(name, params) => Wikicite.formatString(name, params)}
        getString={(name) => Wikicite.getString(name)}
        Prefs={Prefs}
    />,
    document.getElementById('root')
);
