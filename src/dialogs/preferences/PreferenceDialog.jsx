import React, { useState } from 'react';
import PropTypes from 'prop-types';

/* global window */

const PreferenceDialog = (props) => {
    const [storage, setStorage] = useState(props.Prefs.get('storage'));

    function save() {
        props.Prefs.set('storage', storage);
        window.close();
    }

    function cancel() {
        window.close();
    }

    return <div orient="vertical">
        <fieldset>
            <legend>{props.getString('wikicite.prefs.citation-storage')}</legend>
            <span>{props.getString('wikicite.prefs.citation-storage-desc')}</span>
            <br />
            <input id="radio-storage-note" type="radio" name="citation-storage" value="note" checked={storage === 'note'} onClick={() => setStorage('note')} />
            <label htmlFor="radio-storage-note">{props.getString('wikicite.prefs.citation-storage-note')}</label>
            <br />
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
    getString: PropTypes.func,
    Prefs: PropTypes.any
};

export default PreferenceDialog;
