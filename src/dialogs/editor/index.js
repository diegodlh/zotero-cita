import CitationEditor from './CitationEditor';
import React from 'react';
import ReactDOM from 'react-dom';

/* global document, window */

const { Wikicite } = window.arguments[0];

document.title = Wikicite.getString('wikicite.editor.title');

ReactDOM.render(
  <CitationEditor/>, document.getElementById('root')
);
