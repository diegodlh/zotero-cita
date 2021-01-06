/* License */
import Input from 'zotero@components/form/input';
import PropTypes from 'prop-types';
import React from 'react';

function UuidTableRow(props) {
    const id = props.label.toLowerCase();
    return(
        <tr className={`citations-box-${id}`}>
            <td>
                <label htmlFor={id}>{props.label}</label>
            </td>
            <td>
                {/* Fixme: use Editable instead */}
                {/* Causes a warning, because Input uses componentWillReceiveProps
                which has been renamed and is not recommended. But won't show
                in non-strict mode because Zotero devs renamed it to UNSAFE_*/}
                <Input
                    // There is a bug in Zotero's React Input component
                    // Its handleChange event is waiting for an options
                    // parameter from the child input element's onChange
                    // event. This is provided by the custom input element
                    // Autosuggest, but not by the regular HTML input.
                    // This doesn't happen with TextArea, because its
                    // handleChange doesn't expect an options parameter.
                    autoComplete={true}
                    // For the autoComplete workaround to work above,
                    // a getSuggestions function must be provided.
                    // Have it return an empty suggestions array.
                    getSuggestions={() => []}
                    id={id}
                    onCommit={props.onCommit}
                    value={props.value}
                />
            </td>
            <td>
                <button
                    onClick={() => props.onFetch()}
                >
                    <img
                        height="18"
                        width="18"
                        title={`Fetch ${props.label}`}
                        src={`chrome://zotero/skin/arrow_refresh.png`}
                    />
                </button>
            </td>
        </tr>
    );
}

UuidTableRow.propTypes = {
    editable: PropTypes.bool,
    onCommit: PropTypes.func,
    onFetch: PropTypes.func,
    label: PropTypes.string,
    value: PropTypes.string
};

export default UuidTableRow;
