import React, { useState } from 'react';
import Progress from '../../progress';
import PropTypes from 'prop-types';
import SourceItemWrapper from '../../sourceItemWrapper';

/* global window */
/* global Zotero */

const PreferenceDialog = (props) => {
    const [storage, setStorage] = useState(props.Prefs.get('storage'));

    async function migrateStorageLocation(from, to) {
        const progress = new Progress(
            'loading',
            props.getString('wikicite.prefs.citation-storage.progress.migrating')
        );
        const items = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID).filter((item) => item.isRegularItem());
        let migratedItems = 0;
        for (let item of items) {
            item = new SourceItemWrapper(item, from);
            item.migrateCitations(to);
            progress.updateLine('loading', props.formatString('wikicite.prefs.citation-storage.progress.migrated-n-items', [++migratedItems, items.length]));
        }
        progress.updateLine('done', props.getString('wikicite.prefs.citation-storage.progress.done'));
        progress.close();
    }

    function save() {
        if (props.Prefs.get('storage') !== storage) {
            // migrate citation storage location for all items
            migrateStorageLocation(props.Prefs.get('storage'), storage).then(() => props.Prefs.set('storage', storage));
        }
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
            <input id="radio-storage-note" type="radio" name="citation-storage" value="note" defaultChecked={storage === 'note'} onClick={() => setStorage('note')} />
            <label htmlFor="radio-storage-note">{props.getString('wikicite.prefs.citation-storage-note')}</label>
            <br />
            <input id="radio-storage-extra" type="radio" name="citation-storage" value="extra" defaultChecked={storage === 'extra'} onClick={() => setStorage('extra')} />
            <label htmlFor="radio-storage-extra">{props.getString('wikicite.prefs.citation-storage-extra')}</label>
        </fieldset>
        <div className="preference-dialog-footer">
            <button onClick={save}>{props.getString('wikicite.prefs.ok')}</button>
            <button onClick={cancel}>{props.getString('wikicite.prefs.cancel')}</button>
        </div>
    </div>;
}

PreferenceDialog.propTypes = {
    formatString: PropTypes.func,
    getString: PropTypes.func,
    Prefs: PropTypes.any
};

export default PreferenceDialog;
