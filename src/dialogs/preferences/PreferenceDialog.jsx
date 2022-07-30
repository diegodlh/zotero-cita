import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

/* global window */

const PreferenceDialog = (props) => {
    const [storage, setStorage] = useState('');

    useEffect(() => {
        init();
    }, []);

    function init() {
        // note: this is an ugly hack required because window.Wikicite is only set after the window has loaded, and is thus not available when the PreferenceDialog is first rendered
        if (window.Wikicite === undefined) {
            setTimeout(init, 50);
            return;
        }

        setStorage(window.Wikicite.Prefs.get('storage'));
    }

    function save() {
        window.Wikicite.Prefs.set('storage', storage);
        window.close();
    }

    function cancel() {
        window.close();
    }

    return <div orient="vertical">
        <fieldset>
            <legend>{props.getString('wikicite.prefs.citation-storage')}</legend>
            <input id="radio-storage-note" type="radio" name="citation-storage" value="note" checked={storage === 'note'} onClick={() => setStorage('note')} />
            <label htmlFor="radio-storage-note">{props.getString('wikicite.prefs.citation-storage-note')}</label>
            <input id="radio-storage-extra" type="radio" name="citation-storage" value="extra" checked={storage === 'extra'} onClick={() => setStorage('extra')} />
            <label htmlFor="radio-storage-extra">{props.getString('wikicite.prefs.citation-storage-extra')}</label>
        </fieldset>
        <div className="preference-dialog-footer">
            <button onClick={save}>{props.getString('wikicite.prefs.ok')}</button>
            <button onClick={cancel}>{props.getString('wikicite.prefs.cancel')}</button>
        </div>
    </div>;
}

PreferenceDialog.propTypes = {
    getString: PropTypes.func
};

export default PreferenceDialog;
