import React, {
    useEffect,
    useState
} from 'react';
import PropTypes from 'prop-types';

/* global Zotero */

const IdentifierImporter = (props) => {
    return(
        <div orient="vertical">
            <div id="identifier-importer-description">
                <label>
                    {props.getString('identifier-importer.description')}
                </label>
            </div>
            <div id="identifier-importer-textbox">
                <textarea id="identifier-input" rows="5" autofocus/>
            </div>
            <div id="identifier-importer-buttons">
                <button onClick={props.onCancel}>
                    {props.getString('identifier-importer.cancel')}
                </button>
                <button onClick={props.onImport}>
                    {props.getString('identifier-importer.import')}
                </button>
            </div>
        </div>
    )
};

IdentifierImporter.propTypes = {
    getString: PropTypes.func,
    onCancel: PropTypes.func,
    onImport: PropTypes.func
};

export default IdentifierImporter;
