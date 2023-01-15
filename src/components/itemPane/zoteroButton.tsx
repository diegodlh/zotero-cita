import Citation from '../../citation';
import PropTypes from 'prop-types';
import React from 'react';
import Wikicite from '../../wikicite';

declare const Services: any;
declare const Zotero: any;
declare const ZoteroPane: any;

function ZoteroButton(props: any) {
    const key = props.citation.target.key;
    function handleClick() {
        if (key) {
            const libraryID = props.citation.source.item.libraryID;
            const item = Zotero.Items.getByLibraryAndKey(libraryID, key);

            const bttnFlags = (
                (Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING) +
                (Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL) +
                (Services.prompt.BUTTON_POS_2 * Services.prompt.BUTTON_TITLE_IS_STRING)
            );
            const response = Services.prompt.confirmEx(
                window,
                Wikicite.getString('wikicite.citations-pane.linked.confirm.title'),
                Wikicite.formatString(
                    'wikicite.citations-pane.linked.confirm.message',
                    item.getField('title')
                ),
                bttnFlags,
                Wikicite.getString('wikicite.citations-pane.linked.confirm.go'),
                "",
                Wikicite.getString('wikicite.citations-pane.linked.confirm.unlink'),
                undefined,
                {}
            );
            switch (response) {
                case 0:
                    // go
                    ZoteroPane.selectItem(item.id);
                    break
                case 1:
                    // cancel
                    return;
                case 2:
                    // unlink
                    props.citation.unlinkFromZoteroItem();
                    break
            }
        } else {
            props.citation.autoLink();
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
                className={
                    'cita-icon' +
                    (key ? '' : ' light')
                }
            />
        </button>
    );
}

ZoteroButton.propTypes = {
    citation: PropTypes.instanceOf(Citation)
};

export default ZoteroButton;
