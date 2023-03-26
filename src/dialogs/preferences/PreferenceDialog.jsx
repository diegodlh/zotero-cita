import React, { useState } from 'react';
import Progress from '../../progress';
import PropTypes from 'prop-types';
import SourceItemWrapper from '../../sourceItemWrapper';
import { debug } from '../../wikicite';

/* global Services */
/* global window */
/* global Zotero */

const PreferenceDialog = (props) => {
    const [storage, setStorage] = useState(props.Prefs.get('storage'));

    const [username, setUsername] = useState(Zotero.Prefs.get('wikidata-username'));
    const [password, setPassword] = useState(Zotero.Prefs.get('wikidata-password'));

    async function migrateStorageLocation(from, to) {
        const progress = new Progress(
            'loading',
            props.getString('wikicite.prefs.citation-storage.progress.migrating')
        );
        let failedItemTitles = [];
        try {
            await Zotero.DB.executeTransaction(async function() {
                let loadedItems = 0;
                let migratedItems = 0;
                const items = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID).filter((item) => item.isRegularItem());
                const wrappers = [];
                for (let item of items) {
                    try {
                        wrappers.push(new SourceItemWrapper(item, from));
                    } catch (e) {
                        debug(e);
                        failedItemTitles.push(item.getField('title'));
                    }
                    progress.updateLine('loading', props.formatString('wikicite.prefs.citation-storage.progress.loaded-n-items', [++loadedItems, items.length]));
                }
                if (failedItemTitles.length > 0) {
                    throw new Error('Failed to migrate some items');
                }
                for (let wrapper of wrappers) {
                    await wrapper.migrateCitations(to);
                    progress.updateLine('loading', props.formatString('wikicite.prefs.citation-storage.progress.migrated-n-items', [++migratedItems, items.length]));
                }
                props.Prefs.set('storage', storage);
            }, { skipDateModifiedUpdate: true, skipSelect: true });
            progress.updateLine('done', props.getString('wikicite.prefs.citation-storage.progress.done'));
        } catch (e) {
            debug(e);
            progress.updateLine('error', props.getString('wikicite.prefs.citation-storage.progress.failed'));
        } finally {
            progress.close();
        }
        return failedItemTitles;
    }

    function save() {
        if (props.Prefs.get('storage') !== storage) {
            // migrate citation storage location for all items
            migrateStorageLocation(props.Prefs.get('storage'), storage).then((failedItemTitles) => {
                if (failedItemTitles.length != 0) {
                    let message = props.getString('wikicite.prefs.citation-storage.alert.failed-explanation') + '\n';
                    for (let i = 0; i < failedItemTitles.length; i++) {
                        message += '• ' + failedItemTitles[i] + '\n';
                    }
                    Services.prompt.alert(
                        null,
                        props.getString('wikicite.prefs.citation-storage.alert.failed'),
                        message
                    );
                }
            });
        }

        // save credentials if there are defined (the conditions are there to avoid bug with Zotero.Prefs.set();)
        if (username !== undefined) {
            Zotero.Prefs.set('wikidata-username', username);
        }
        if (password !== undefined) {
            Zotero.Prefs.set('wikidata-password', password);
        }

        window.close();
    }

    function cancel() {
        window.close();
    }

    return <div orient="vertical">
        <fieldset>
            <legend>{props.getString('wikicite.prefs.wikidata-credentials')}</legend>
            <span>{props.getString('wikicite.prefs.wikidata-credentials-desc')}</span>
            <br />
            <label htmlFor="wikidata-credentials-username">{props.getString('wikicite.prefs.wikidata-credentials-username')}</label>
            <input id="text-credentials-username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} />
            <br />
            <label htmlFor="wikidata-credentials-password">{props.getString('wikicite.prefs.wikidata-credentials-password')}</label>
            <input id="text-credentials-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </fieldset>
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
