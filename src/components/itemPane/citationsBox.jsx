/* License */
import React, {
    useEffect,
    useState
} from 'react';
import { Button } from '../button';
import Citation from '../../citation';
import CitationList from '../../citationList';
import { IntlProvider } from 'react-intl';
import PropTypes from 'prop-types';
import UuidTableRow from './uuidTableRow';
import Wikicite from '../../wikicite';

/* global window */
/* global Zotero */

function CitationsBox(props) {
    const [citations, setCitations] = useState([]);
    const [doi, setDoi] = useState('');
    const [occ, setOcc] = useState('');
    const [qid, setQid] = useState('');
    const [hasAttachments, setHasAttachments] = useState(false);

    const removeStr = Zotero.getString('general.remove');

    useEffect(() => {
        setCitations(props.citationList.citations);
        setDoi(props.citationList.sourceItem.getField('DOI'));
        // Fixme: to avoid parsing the extra field twice, consider redefining
        // Wikicite.getExtraField to allow multiple fieldnames as input
        // and return a fieldName: [values]} object instead
        setOcc(
            Wikicite.getExtraField(props.citationList.sourceItem, 'occ').values[0] ?? ''
        );
        setQid(
            Wikicite.getExtraField(props.citationList.sourceItem, 'qid').values[0] ?? ''
        );
        setHasAttachments(
            Boolean(props.citationList.sourceItem.getAttachments().length)
        );
    }, [props.citationList]);

    /**
     * Opens the citation editor window.
     * @param {Citation} citation - Citation to be edited.
     * @param {Object} usedUUIDs - UUIDs used by other citations in the Citation List.
     * @returns {Zotero.Item} - Edited cited item.
     */
    function openEditor(citation, usedUUIDs) {
        const args = {
            citation: citation,
            usedUUIDs: usedUUIDs
        };
        const retVals = {};
        window.openDialog(
            'chrome://wikicite/content/editor.html',
            '',
            'chrome,dialog=no,modal,centerscreen,resizable=yes',
            args,
            retVals
        );
        return retVals.item;
    }

    function handleCitationAdd() {
        const citation = new Citation({
            item: {
                itemType: 'journalArticle'  // Fixme: maybe replace with a const
            },
            suppliers: []
        }, props.citationList.sourceItem);
        const item = openEditor(citation, props.citationList.getUsedUUIDs());
        if (!item) {
            // Fixme: move console.log to wikicite debug
            console.log('Edit cancelled by user.');
            return;
        }
        if (
            qid && Wikicite.getExtraField(item, 'qid').values[0]
        ) {
            console.log('Source and target items have QIDs! Offer syncing to Wikidata.')
        }
        citation.item = item;

        props.citationList.add(citation);

        // Make sure the component updates even before changes are saved to the item
        // setCitations(
        //   // citationList.citations  // this doesn't work because citationList.citation object's reference hasn't changed
        //   // () => citationList.citations  // works only one time per render - possibly because the function itself doesn't change
        //   [...citationList.citations]  // works
        // );
        // Problem is if I do this [...citations], the citations passed down to CitationsBox
        // are not the citations of the CitationsList here. Therefore, if I implement methods
        // in the Citation class to modify themselves, they won't work.

        // This will save changes to the item's extra field
        // The modified item observer above will be triggered.
        // This will update the citationList ref, and the component's state.
        props.citationList.save();
        // Unexpectedly, this also triggers the zotero-items-tree `select` event
        // which in turn runs zoteroOverlay's refreshCitationsPaneMethod.
        // However, as props.item will not have changed, component will not update.
    }

    function handleCitationEdit(index) {
        const citation = citations[index];
        const item = openEditor(
            citation,
            props.citationList.getUsedUUIDs(index)
        );
        // Fixme: I don't like that I'm repeating code from addCitation
        // tagsBox has a single updateTags method instead
        if (!item) {
            // Fixme: move console.log to wikicite debug
            console.log('Edit cancelled by user.');
            return;
        }
        if (
            qid && Wikicite.getExtraField(item, 'qid').values[0]
        ) {
            console.log('Source and target items have QIDs! Offer syncing to Wikidata.')
        }
        citation.item = item;

        props.citationList.citations[index] = citation;
        props.citationList.save();
    }

    async function handleCitationDelete(index) {
        let sync = false;
        const citation = citations[index];
        if (citation.suppliers.includes('wikidata')) {
            // ask user if they want to remove link remotely as well
            sync = true;
        }
        await props.citationList.delete(index, sync);
        props.citationList.save();
    }

    function handleCitationMove(index, shift) {
        const citation = props.citationList.citations.splice(index, 1)[0];
        const newIndex = index + shift;
        props.citationList.citations.splice(newIndex, 0, citation);
        props.citationList.save();
    }

    function handleDoiCommit(newDoi) {
        // setDoi(newDoi);
        props.citationList.sourceItem.setField('DOI', newDoi);
        props.citationList.sourceItem.saveTx();
    }

    function handleOccCommit(newOcc) {
        // setOcc(newOcc);
        Wikicite.setExtraField(props.citationList.sourceItem, 'occ', newOcc);
        props.citationList.sourceItem.saveTx();
    }

    function handleQidCommit(newQid) {
        // setQid(newQid);
        Wikicite.setExtraField(props.citationList.sourceItem, 'qid', newQid);
        props.citationList.sourceItem.saveTx();
    }

    function handleDoiFetch() {
        alert('Fetching DOI not yet supported');
    }

    function handleOccFetch() {
        alert('Fetching OCC not yet supported');
    }

    function handleQidFetch() {
        alert('Fetching QID not yet supported');
    }

    function renderCount() {
        var count = citations.length;
        var str = 'wikicite.citationsPane.citations.count.';
        // TODO: Switch to plural rules
        switch (count) {
            case 0:
                str += 'zero';
                break;
            case 1:
                str += 'singular';
                break;
            default:
                str += 'plural';
                break;
        }
        return Wikicite._bundle.formatStringFromName(str, [count], 1);
    }

    function renderCitationRow(citation, index) {
        let item = citation.item;
        const itemType = Zotero.ItemTypes.getName(item.itemTypeID);
        let linked = false;
        if (item.key) {
            //Fixme: Handle error
            item = Zotero.Items.getByLibraryAndKey(item.libraryID, item.key);
            linked = true;
        }
        let syncable = qid && item.qid;
        let synced = citation.suppliers.wikidata;

        const isFirstCitation = index === 0;
        const isLastCitation = index === citations.length - 1;

        const label = citation.getLabel();
        return (
            <li
                className="citation"
                key={index}
            >
                <img
                    src={Zotero.ItemTypes.getImageSrc(itemType)}
                    title={Zotero.ItemTypes.getLocalizedString(itemType)}
                />
                <div
                    className="editable-container"
                    title={label}
                >
                    <div
                        className="editable"
                        onClick={ () => handleCitationEdit(index) }
                    >
                        <div className="zotero-clicky editable-content">
                            {label}
                        </div>
                    </div>
                </div>
                {props.editable && (
                    // https://github.com/babel/babel-sublime/issues/368
                <>
                    <button>
                        <img
                            title={
                                linked ?
                                'Go to linked Zotero item' :
                                'Link to Zotero item'
                            }
                            src={`chrome://zotero/skin/zotero-new-z-16px.png`}
                        />
                    </button>
                    <button>
                        <img
                            title={
                                // eslint-disable-next-line no-nested-ternary
                                syncable ? (
                                    synced ?
                                    'Go to source item Wikidata entry' : // alternatively, go to OCI
                                    'Upload to Wikidata'
                                ) :
                                'Both source and target items must have QID to sync to Wikidata'
                            }
                            src={`chrome://wikicite/skin/wikidata.png`}
                        />
                    </button>
                    <button
                        disabled={ isFirstCitation }
                        onClick={() => handleCitationMove(index, -1)}
                    >
                        <img
                            title="Move up"
                            src={`chrome://zotero/skin/citation-up.png`}
                        />
                    </button>
                    <button
                        disabled={ isLastCitation }
                        onClick={() => handleCitationMove(index, +1)}
                    >
                        <img
                            title="Move down"
                            src={`chrome://zotero/skin/citation-down.png`}
                        />
                    </button>
                    <button
                        title={removeStr}
                        onClick={ () => handleCitationDelete(index) }
                        tabIndex="-1"
                    >
                        <img
                            alt={removeStr}
                            title={removeStr}
                            // Fixme: does it change when active?
                            src={`chrome://zotero/skin/minus${Zotero.hiDPISuffix}.png`}/>
                    </button>
                    <button
                        className="btn-icon"
                        onClick={(event) => props.onCitationPopup(event, index)}
                    >
                        <span className="menu-marker"></span>
                    </button>
                </
                >
                )}
            </li>
        )
    }

    return (
        <div className="citations-box">
            <div className="citations-box-header">
                <div className="citations-box-count">{renderCount()}</div>
                { props.editable &&
                    <div>
                        <button onClick={() => handleCitationAdd()}>
                            {Wikicite.getString('wikicite.citationsPane.add')}
                        </button>
                    </div>
                }
                <IntlProvider
                    locale={Zotero.locale}
                    // Fixme: improve messages object
                    messages={{
                        'wikicite.citationsPane.more': Wikicite.getString(
                            'wikicite.citationsPane.more'
                        )
                    }}
                >
                    <Button
                        /*icon={
                            <span>
                                <img
                                    height="16px"
                                    src="chrome://wikicite/skin/wikicite.png"
                                />
                            </span>
                        }*/
                        className="citations-box-actions"
                        isMenu={true}
                        onClick={props.onItemPopup}
                        text="wikicite.citationsPane.more"
                        title=""
                        size="sm"
                    />
                </IntlProvider>
            </div>
            <div className="citations-box-list-container">
                <ul className="citations-box-list">
                    {/* Fixme: do not use index as React key - reorders will be slow!
                    https://reactjs.org/docs/reconciliation.html#keys
                    What about using something like bibtex keys?*/}
                    {/* Maybe in the future the index of the Citation in the CitationList
                    will be a property of the Citation itself */}
                    {citations.map((citation, index) => renderCitationRow(citation, index))}
                </ul>
            {/* I understand this bit here makes TAB create a new tag
                { props.editable && <span
                    tabIndex="0"
                    onFocus={handleAddTag}
                /> }
                 */}
            </div>
            <div className="citations-box-footer">
                <table className="citations-box-uuids">
                    <tbody>
                        <UuidTableRow
                            editable={props.editable}
                            label="QID"
                            onCommit={handleQidCommit}
                            onFetch={handleQidFetch}
                            value={qid}
                        />
                        <UuidTableRow
                            editable={props.editable}
                            label="DOI"
                            onCommit={handleDoiCommit}
                            onFetch={handleDoiFetch}
                            value={doi}
                        />
                        <UuidTableRow
                            editable={props.editable}
                            label="OCC"
                            onCommit={handleOccCommit}
                            onFetch={handleOccFetch}
                            value={occ}
                        />
                    </tbody>
                </table>
                {/*<div className="citations-box-footer-buttons" style={{display: "flex"}}>
                    <button
                        onClick={() => props.citationList.getFromPDF()}
                        disabled={!hasAttachments}
                    >Extract from attachments</button>
                    <button
                        onClick={() => props.citationList.exportToCroci()}
                        disabled={!doi}
                    >Export to CROCI</button>
                </div>*/}
            </div>
        </div>
    );
}

CitationsBox.propTypes = {
    editable: PropTypes.bool,
    citationList: PropTypes.instanceOf(CitationList),
    onItemPopup: PropTypes.func,
    onCitationPopup: PropTypes.func
};

export default CitationsBox;
