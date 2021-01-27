import Citation from '../../citation';
import PropTypes from 'prop-types';
import React from 'react';

/* global Zotero */
/* global ZoteroPane */

function ZoteroButton(props) {
    const key = props.citation.zotero;
    function handleClick() {
        if (key) {
            const libraryID = props.citation.source.item.libraryID;
            const id = Zotero.Items.getIDFromLibraryAndKey(libraryID, key);
            if (id) {
                ZoteroPane.selectItem(id);
            }
        } else {
            props.citation.linkToZoteroItem();
        }
    }

    const title = (
        key ?
        'Go to linked Zotero item' :
        'Link to Zotero item'
    );

    return(
        <button
            onClick={() => handleClick()}
        >
            <img
                title={title}
                src={`chrome://zotero/skin/zotero-new-z-16px.png`}
                className={key ? '' : 'light'}
            />
        </button>
    );
}

ZoteroButton.propTypes = {
    citation: PropTypes.instanceOf(Citation)
};

export default ZoteroButton;
