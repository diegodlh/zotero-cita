import CitationEditor from './CitationEditor';
import React from 'react';
import ReactDOM from 'react-dom';
import Wikicite from '../../wikicite';

/* global document */

document.title = Wikicite.getString('wikicite.editor.title');

ReactDOM.render(
  <CitationEditor/>, document.getElementById('root')
);
