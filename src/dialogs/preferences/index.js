import PreferenceDialog from './PreferenceDialog';
import React from 'react';
import ReactDOM from 'react-dom';

/* global document, window */

const { Wikicite } = window.arguments[0];

document.title = Wikicite.getString('wikicite.prefs.title');
ReactDOM.render(
    <PreferenceDialog
        getString={(name) => Wikicite.getString(name)}
    />,
    document.getElementById('root')
);
