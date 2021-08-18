import PropTypes from 'prop-types';
import React from 'react';


const CitationImporter = (props) => (
    <div orient="vertical">
        <div id="citation-importer-description">
            <label>
                {props.getString('citation-importer.description')}
            </label>
        </div>
        <div id="citation-importer-textbox">
            <textarea id="citation-input" rows="15"/>
        </div>
        <div id="citation-importer-buttons">
            <button onClick={props.onCancel}>
                {props.getString('citation-importer.cancel')}
            </button>
            <button onClick={props.onImportFile}>
                {props.getString('citation-importer.import-file')}
            </button>
            <button onClick={props.onImportText}>
                {props.getString('citation-importer.import-text')}
            </button>
        </div>
    </div>
)


CitationImporter.propTypes = {
    getString: PropTypes.func,
    onCancel: PropTypes.func,
    onImportFile: PropTypes.func,
    onImportText: PropTypes.func
};

export default CitationImporter;
