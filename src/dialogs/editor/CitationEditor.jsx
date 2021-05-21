import React, {
    useEffect,
    useState
} from 'react';
import PIDRow from '../../components/pidRow';
import PropTypes from 'prop-types';

/* global Zotero */

const visibleBaseFieldNames = [
    'title',
    'publicationTitle',
    'date'
];

// Fixme: as a Citation Editor (not a target item editor)
// consider providing at least some read only information about the citation
// such as label of the source item, OCIs, and Zotero link status
const CitationEditor = (props) => {
    const [pidTypes, setPidTypes] = useState(props.item.getPIDTypes());

    useEffect(() => {
        // const addCreatorRow = props.itemBox.addCreatorRow.bind(props.itemBox);
        // props.itemBox.addCreatorRow = function(creatorData, creatorTypeIDOrName, unsaved, defaultRow) {
        //     addCreatorRow(creatorData, creatorTypeIDOrName, false, defaultRow)
        // };

        // props.itemBox.disableCreatorAddButtons = () => {};

        // props.itemBox.blurOpenField = () => {};

        // if item's saveTx overwritten with itembox.refresh,
        // sometimes itembox gets stucked in a loop
        // overwrite _focusNextField as a workaround
        props.itemBox._focusNextField = () => {};

        // const disableButton = props.itemBox.disableButton.bind(props.itemBox);
        // props.itemBox.disableButton = function(button) {
        //     if (
        //         button.value === '+' &&
        //         this._dynamicFields.getElementsByAttribute('value', '+').length === 1
        //     ) return;
        //     disableButton(button);
        // }
        props.itemBox.mode = 'edit';

        // itembox sometimes fails to update if saveOnEdit is set to false
        // make sure item's saveTx is overwritten to prevent actual item saving
        props.itemBox.saveOnEdit = true;
        setHiddenFields(props.item.item.itemTypeID);
        props.itemBox.item = props.item.item;

        // props.itemBox.item.saveTx = function() {
        //     if (!props.itemBox.item._refreshed) {
        //         props.itemBox.refresh();
        //     }
        // }
        props.itemBox.addHandler(
            'itemtypechange',
            onItemTypeChange
        );
    }, []);

    function onItemTypeChange() {
        setPidTypes(props.item.getPIDTypes());
        setHiddenFields(props.item.item.itemTypeID);
        props.itemBox.refresh();
    }

    function setHiddenFields(itemTypeID) {
        const visibleFieldIDs = visibleBaseFieldNames.map(
            (fieldName) => Zotero.ItemFields.getFieldIDFromTypeAndBase(
                itemTypeID, fieldName
            )
        );
        props.itemBox.hiddenFields = Zotero.ItemFields.getItemTypeFields(
            itemTypeID
        )
        .filter((fieldID) => !visibleFieldIDs.includes(fieldID))
        .map((fieldID) => Zotero.ItemFields.getName(fieldID))
        .concat(['dateAdded', 'dateModified']);
    }

    return(
        <div orient="vertical">
            <ul className="pid-list">
            {
                pidTypes.map(
                    (pidType) =>  <PIDRow
                        autosave={false}
                        editable={true}
                        item={props.item}
                        key={pidType}
                        type={pidType}
                        validate={props.checkCitationPID}
                    />
                )
            }
            </ul>
            <div id="citation-editor-buttons">
                <button onClick={props.onCancel}>
                    {props.getString('editor.cancel')}
                </button>
                <button onClick={props.onSave}>
                    {props.getString('editor.save')}
                </button>
            </div>
        </div>
    )
};

CitationEditor.propTypes = {
    checkCitationPID: PropTypes.func,
    item: PropTypes.object,  // ItemWrapper
    itemBox: PropTypes.object, // zoteroitembox
    getString: PropTypes.func,
    onCancel: PropTypes.func,
    onSave: PropTypes.func
};

export default CitationEditor;
