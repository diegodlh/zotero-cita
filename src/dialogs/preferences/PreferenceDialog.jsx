import PropTypes from 'prop-types';
import React from 'react';

const PreferenceDialog = (props) => <div orient="vertical">
        <fieldset>
            <legend>{props.getString('wikicite.prefs.citation-storage')}</legend>
            <input id="radio-storage-note" type="radio" name="citation-storage" value="note" />
            <label htmlFor="radio-storage-note">{props.getString('wikicite.prefs.citation-storage-note')}</label>
            <input id="radio-storage-extra" type="radio" name="citation-storage" value="extra" />
            <label htmlFor="radio-storage-extra">{props.getString('wikicite.prefs.citation-storage-extra')}</label>
        </fieldset>
        <div className="preference-dialog-footer">
            <button>{props.getString('wikicite.prefs.ok')}</button>
            <button>{props.getString('wikicite.prefs.cancel')}</button>
        </div>
    </div>;

PreferenceDialog.propTypes = {
    getString: PropTypes.func
};

export default PreferenceDialog;
