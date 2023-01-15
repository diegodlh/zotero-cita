import PreferenceDialog from './PreferenceDialog';
import React from 'react';
import ReactDOM from 'react-dom';

declare global {
    interface Window { arguments: any[] }
}

const { Wikicite, Prefs } = window.arguments[0];

document.title = Wikicite.getString('wikicite.prefs.title');
ReactDOM.render(
    <PreferenceDialog
        formatString={(name: string, params: string|string[]) => Wikicite.formatString(name, params)}
        getString={(name:string) => Wikicite.getString(name)}
        Prefs={Prefs}
    />,
    document.getElementById('root')
);
