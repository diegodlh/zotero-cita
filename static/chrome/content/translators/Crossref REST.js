{
	"translatorID": "0a61e167-de9a-4f93-a68a-628b48855909",
	"label": "Crossref REST",
	"creator": "Martynas Bagdonas",
	"target": "",
	"minVersion": "5.0.0",
	"maxVersion": "",
	"priority": 90,
	"inRepository": true,
	"translatorType": 9,
	"lastUpdated": "2024-10-28 07:41:50"
}

/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2018

	This file is part of Zotero.

	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero. If not, see <http://www.gnu.org/licenses/>.

	***** END LICENSE BLOCK *****
*/

// Based on Crossref Unixref XML translator

// The translator uses the newer REST API
// https://github.com/Crossref/rest-api-doc
// https://github.com/Crossref/rest-api-doc/blob/master/api_format.md
// http://api.crossref.org/types

// REST API documentation not always reflect the actual API
// and some fields are undocumented e.g. resource, institution, etc. are missing

// Some fields are sometimes missing for certain items when compared to the Crossref Unixref XML
// translator e.g. ISBN, pages, editors, contributors, language, etc.

function removeUnsupportedMarkup(text) {
	let markupRE = /<(\/?)(\w+)[^<>]*>/gi;
	let supportedMarkup = ['i', 'b', 'sub', 'sup', 'span', 'sc'];
	let transformMarkup = {
		scp: {
			open: '<span style="font-variant:small-caps;">',
			close: '</span>'
		}
	};
	// Remove CDATA markup
	text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
	text = text.replace(markupRE, function (m, close, name) {
		name = name.toLowerCase();
		if (supportedMarkup.includes(name)) {
			return (close ? '</' : '<') + name + '>';
		}
		let newMarkup = transformMarkup[name];
		if (newMarkup) {
			return close ? newMarkup.close : newMarkup.open;
		}
		return '';
	});
	return text;
}

function decodeEntities(n) {
	let escaped = {
		'&amp;': '&',
		'&quot;': '"',
		'&lt;': '<',
		'&gt;': '>'
	};
	return n.replace(/\n/g, '').replace(/(&quot;|&lt;|&gt;|&amp;)/g, (str, item) => escaped[item]);
}

function fixAuthorCapitalization(string) {
	// Try to use capitalization function from Zotero Utilities,
	// because the current one doesn't support unicode names.
	// Can't fix this either because ZU.XRegExp.replace is
	// malfunctioning when calling from translators.
	if (ZU.capitalizeName) {
		return ZU.capitalizeName(string);
	}
	if (typeof string === 'string' && string.toUpperCase() === string) {
		string = string.toLowerCase().replace(/\b[a-z]/g, function (m) {
			return m[0].toUpperCase();
		});
	}
	return string;
}

function parseCreators(result, item, typeOverrideMap) {
	let types = ['author', 'editor', 'chair', 'translator'];

	for (let type of types) {
		if (result[type]) {
			let creatorType = typeOverrideMap && typeOverrideMap[type] !== undefined
				? typeOverrideMap[type]
				: (type === 'author' || type === 'editor' || type === 'translator' ? type : 'contributor');

			if (!creatorType) {
				continue;
			}

			for (let creator of result[type]) {
				let newCreator = {};
				newCreator.creatorType = creatorType;

				if (creator.name) {
					newCreator.fieldMode = 1;
					newCreator.lastName = creator.name;
				}
				else {
					newCreator.firstName = fixAuthorCapitalization(creator.given);
					newCreator.lastName = fixAuthorCapitalization(creator.family);
					if (!newCreator.firstName) {
						newCreator.fieldMode = 1;
					}
				}

				item.creators.push(newCreator);
			}
		}
	}
}

function parseDate(dateObj) {
	if (dateObj && dateObj['date-parts'] && dateObj['date-parts'][0]) {
		let [year, month, day] = dateObj['date-parts'][0];
		if (year) {
			if (month) {
				if (day) {
					return year + '-' + month.toString().padStart(2, '0') + '-' + day.toString().padStart(2, '0');
				}
				else {
					return month.toString().padStart(2, '0') + '/' + year;
				}
			}
			else {
				return year.toString();
			}
		}
	}
	return null;
}

function processCrossref(json) {
	let creatorTypeOverrideMap = {};
	Z.debug(json);
	for (let result of json.message.items) {
		let item;
		if (['journal', 'journal-article', 'journal-volume', 'journal-issue'].includes(result.type)) {
			item = new Zotero.Item('journalArticle');
		}
		else if (['report', 'report-series', 'report-component'].includes(result.type)) {
			item = new Zotero.Item('report');
		}
		else if (['book', 'book-series', 'book-set', 'book-track', 'monograph', 'reference-book', 'edited-book'].includes(result.type)) {
			item = new Zotero.Item('book');
		}
		else if (['book-chapter', 'book-part', 'book-section', 'reference-entry'].includes(result.type)) {
			item = new Zotero.Item('bookSection');
			creatorTypeOverrideMap = { author: 'bookAuthor' };
		}
		else if (result.type === 'other' && result.ISBN && result['container-title']) {
			item = new Zotero.Item('bookSection');
			if (result['container-title'].length >= 2) {
				item.seriesTitle = result['container-title'][0];
				item.bookTitle = result['container-title'][1];
			}
			else {
				item.bookTitle = result['container-title'][0];
			}
			creatorTypeOverrideMap = { author: 'bookAuthor' };
		}
		else if (['standard'].includes(result.type)) {
			item = new Zotero.Item('standard');
		}
		else if (['dataset', 'database'].includes(result.type)) {
			item = new Zotero.Item('dataset');
		}
		else if (['proceedings', 'proceedings-article', 'proceedings-series'].includes(result.type)) {
			item = new Zotero.Item('conferencePaper');
		}
		else if (result.type === 'dissertation') {
			item = new Zotero.Item('thesis');
			item.date = parseDate(result.approved);
			item.thesisType = result.degree && result.degree[0] && result.degree[0].replace(/\(.+\)/, '');
		}
		else if (result.type === 'posted-content') {
			if (result.subtype === 'preprint') {
				item = new Zotero.Item('preprint');
				item.repository = result['group-title'];
			}
			else {
				item = new Zotero.Item('blogPost');
				if (result.institution && result.institution.length) {
					item.blogTitle = result.institution[0].name && result.institution[0].name;
				}
			}
		}
		else if (result.type === 'peer-review') {
			item = new Zotero.Item('manuscript');
			item.type = 'peer review';
			if (!result.author) {
				item.creators.push({ lastName: 'Anonymous Reviewer', fieldMode: 1, creatorType: 'author' });
			}
			if (result.relation && result.relation['is-review-of'] && result.relation['is-review-of'].length) {
				let identifier;
				let reviewOf = result.relation['is-review-of'][0];
				let type = reviewOf['id-type'];
				let id = reviewOf.id;
				if (type === 'doi') {
					identifier = '<a href="https://doi.org/' + id + '">https://doi.org/' + id + '</a>';
				}
				else if (type === 'url') {
					identifier = '<a href="' + id + '">' + id + '</a>';
				}
				else {
					identifier = id;
				}
				item.notes.push('Review of ' + identifier);
			}
		}
		else {
			item = new Zotero.Item('document');
		}

		parseCreators(result, item, creatorTypeOverrideMap);

		if (result.description) {
			item.notes.push(result.description);
		}

		item.abstractNote = result.abstract && removeUnsupportedMarkup(result.abstract);
		item.pages = result.page;
		item.ISBN = result.ISBN && result.ISBN.join(', ');
		item.ISSN = result.ISSN && result.ISSN.join(', ');
		item.issue = result.issue;
		item.volume = result.volume;
		item.language = result.language;
		item.edition = result['edition-number'];
		item.university = item.institution = item.publisher = result.publisher;

		if (result['container-title'] && result['container-title'][0]) {
			if (['journalArticle'].includes(item.itemType)) {
				item.publicationTitle = result['container-title'][0];
			}
			else if (['conferencePaper'].includes(item.itemType)) {
				item.proceedingsTitle = result['container-title'][0];
			}
			else if (['book'].includes(item.itemType)) {
				item.series = result['container-title'][0];
			}
			else if (['bookSection'].includes(item.itemType)) {
				item.bookTitle = result['container-title'][0];
			}
			else {
				item.seriesTitle = result['container-title'][0];
			}
		}

		item.conferenceName = result.event && result.event.name;

		// "short-container-title" often has the same value as "container-title", so it can be ignored
		if (result['short-container-title'] && result['short-container-title'][0] !== result['container-title'][0]) {
			item.journalAbbreviation = result['short-container-title'][0];
		}

		if (result.event && result.event.location) {
			item.place = result.event.location;
		}
		else if (result.institution && result.institution[0] && result.institution[0].place) {
			item.place = result.institution[0].place.join(', ');
		}
		else {
			item.place = result['publisher-location'];
		}

		item.institution = item.university = result.institution && result.institution[0] && result.institution[0].name;

		// Prefer print to other dates
		if (parseDate(result['published-print'])) {
			item.date = parseDate(result['published-print']);
		}
		else if (parseDate(result.issued)) {
			item.date = parseDate(result.issued);
		}

		// For item types where DOI isn't supported, it will be automatically added to the Extra field.
		// However, this won't show up in the translator tests
		item.DOI = result.DOI;

		item.url = result.resource && result.resource.primary && result.resource.primary.URL;

		// Using only the first license
		item.rights = result.license && result.license[0] && result.license[0].URL;

		if (result.title && result.title[0]) {
			item.title = result.title[0];
			if (result.subtitle && result.subtitle[0]) {
				// Avoid duplicating the subtitle if it already exists in the title
				if (!item.title.toLowerCase().includes(result.subtitle[0].toLowerCase())) {
					// Sometimes title already has a colon
					if (item.title[item.title.length - 1] !== ':') {
						item.title += ':';
					}
					item.title += ' ' + result.subtitle[0];
				}
			}
			item.title = removeUnsupportedMarkup(item.title);
		}

		if (!item.title) {
			item.title = '[No title found]';
		}

		// Check if there are potential issues with character encoding and try to fix them.
		// E.g., in 10.1057/9780230391116.0016, the en dash in the title is displayed as â<80><93>,
		// which is what you get if you decode a UTF-8 en dash (<E2><80><93>) as Latin-1 and then serve
		// as UTF-8 (<C3><A2> <C2><80> <C2><93>)
		for (let field in item) {
			if (typeof item[field] != 'string') {
				continue;
			}
			// Check for control characters that should never be in strings from Crossref
			if (/[\u007F-\u009F]/.test(item[field])) {
				// <E2><80><93> -> %E2%80%93 -> en dash
				try {
					item[field] = decodeURIComponent(escape(item[field]));
				}
				// If decoding failed, just strip control characters
				// https://forums.zotero.org/discussion/102271/lookup-failed-for-doi
				catch (e) {
					item[field] = item[field].replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
				}
			}
			item[field] = decodeEntities(item[field]);
		}
		item.libraryCatalog = 'Crossref';
		item.complete();
	}
}

function detectSearch(item) {
	return false;
}

async function doSearch(item) {
	let query = null;

	if (item.DOI) {
		if (Array.isArray(item.DOI)) {
			query = '?filter=doi:' + item.DOI.map(x => ZU.cleanDOI(x)).filter(x => x).join(',doi:');
		}
		else {
			query = '?filter=doi:' + ZU.cleanDOI(item.DOI);
		}
	}
	else if (item.query) {
		query = '?query.bibliographic=' + encodeURIComponent(item.query);
	}
	else {
		return;
	}

	// Note: Cannot speed up the request by selecting only the necessary fields because Crossref
	// throws errors for selecting certain fields, e.g. resource, institution, etc.
	// TODO: Try to test this again in future
	// let selectedFields = [
	// 	'type', 'ISBN', 'container-title', 'author', 'editor', 'chair', 'translator',
	// 	'abstract', 'page', 'ISSN', 'issue', 'volume', 'language', 'edition-number',
	// 	'publisher', 'short-container-title', 'event', 'institution', 'publisher-location',
	// 	'published-print', 'issued', 'DOI', 'resource', 'license', 'title', 'subtitle',
	// 	'approved', 'degree', 'subtype', 'group-title', 'relation'
	// ];
	// query += '&select=' + encodeURIComponent(selectedFields.join(','));

	if (Z.getHiddenPref('CrossrefREST.email')) {
		query += '&mailto=' + Z.getHiddenPref('CrossrefREST.email');
	}

	let json = await requestJSON('https://api.crossref.org/works/' + query);
	processCrossref(json);
}

// copied from CSL JSON
function parseInput() {
	var str, json = "";
	
	// Read in the whole file at once, since we can't easily parse a JSON stream. The
	// chunk size here is pretty arbitrary, although larger chunk sizes may be marginally
	// faster. We set it to 1MB.
	while ((str = Z.read(1048576)) !== false) json += str;
	
	try {
		return JSON.parse(json);
	}
	catch (e) {
		Zotero.debug(e);
		return false;
	}
}

function detectImport() {
	var parsedData = parseInput();
	if (parsedData && parsedData["message-type"] === "work-list") {
		return true;
	}
	return false;
}

function doImport() {
	var json = parseInput();
	processCrossref(json);
}

/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "search",
		"input": {
			"DOI": "10.1109/isscc.2017.7870285"
		},
		"items": [
			{
				"itemType": "conferencePaper",
				"title": "6.1 A 56Gb/s PAM-4/NRZ transceiver in 40nm CMOS",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Pen-Jui",
						"lastName": "Peng"
					},
					{
						"creatorType": "author",
						"firstName": "Jeng-Feng",
						"lastName": "Li"
					},
					{
						"creatorType": "author",
						"firstName": "Li-Yang",
						"lastName": "Chen"
					},
					{
						"creatorType": "author",
						"firstName": "Jri",
						"lastName": "Lee"
					}
				],
				"date": "02/2017",
				"DOI": "10.1109/isscc.2017.7870285",
				"conferenceName": "2017 IEEE International Solid- State Circuits Conference - (ISSCC)",
				"libraryCatalog": "Crossref",
				"place": "San Francisco, CA, USA",
				"proceedingsTitle": "2017 IEEE International Solid-State Circuits Conference (ISSCC)",
				"publisher": "IEEE",
				"url": "http://ieeexplore.ieee.org/document/7870285/",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1111/1574-6941.12040"
		},
		"items": [
			{
				"itemType": "journalArticle",
				"title": "Microbial community changes at a terrestrial volcanic CO<sub>2</sub>vent induced by soil acidification and anaerobic microhabitats within the soil column",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Janin",
						"lastName": "Frerichs"
					},
					{
						"creatorType": "author",
						"firstName": "Birte I.",
						"lastName": "Oppermann"
					},
					{
						"creatorType": "author",
						"firstName": "Simone",
						"lastName": "Gwosdz"
					},
					{
						"creatorType": "author",
						"firstName": "Ingo",
						"lastName": "Möller"
					},
					{
						"creatorType": "author",
						"firstName": "Martina",
						"lastName": "Herrmann"
					},
					{
						"creatorType": "author",
						"firstName": "Martin",
						"lastName": "Krüger"
					}
				],
				"date": "04/2013",
				"DOI": "10.1111/1574-6941.12040",
				"ISSN": "0168-6496",
				"issue": "1",
				"journalAbbreviation": "FEMS Microbiol Ecol",
				"language": "en",
				"libraryCatalog": "Crossref",
				"pages": "60-74",
				"publicationTitle": "FEMS Microbiology Ecology",
				"url": "https://academic.oup.com/femsec/article-lookup/doi/10.1111/1574-6941.12040",
				"volume": "84",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.2747/1539-7216.50.2.197"
		},
		"items": [
			{
				"itemType": "journalArticle",
				"title": "The Chinese<i>Hukou</i>System at 50",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Kam Wing",
						"lastName": "Chan"
					}
				],
				"date": "03/2009",
				"DOI": "10.2747/1539-7216.50.2.197",
				"ISSN": "1538-7216, 1938-2863",
				"issue": "2",
				"language": "en",
				"libraryCatalog": "Crossref",
				"pages": "197-221",
				"publicationTitle": "Eurasian Geography and Economics",
				"url": "https://www.tandfonline.com/doi/full/10.2747/1539-7216.50.2.197",
				"volume": "50",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.17077/etd.xnw0xnau"
		},
		"items": [
			{
				"itemType": "thesis",
				"title": "Contributions to geomagnetic theory",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Joseph Emil",
						"lastName": "Kasper"
					}
				],
				"date": "1958",
				"libraryCatalog": "Crossref",
				"place": "Iowa City, IA, United States",
				"rights": "http://rightsstatements.org/vocab/InC/1.0/",
				"thesisType": "Doctor of Philosophy",
				"university": "The University of Iowa",
				"url": "https://iro.uiowa.edu/esploro/outputs/doctoral/9983777035702771",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.31219/osf.io/8ag3w"
		},
		"items": [
			{
				"itemType": "preprint",
				"title": "Open Practices in Visualization Research",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Steve",
						"lastName": "Haroz"
					}
				],
				"date": "2018-07-03",
				"DOI": "10.31219/osf.io/8ag3w",
				"abstractNote": "Two fundamental tenants of scientific research are that it can be scrutinized and built-upon. Both require that the collected data and supporting materials be shared, so others can examine, reuse, and extend them. Assessing the accessibility of these components and the paper itself can serve as a proxy for the reliability, replicability, and applicability of a field’s research. In this paper, I describe the current state of openness in visualization research and provide suggestions for authors, reviewers, and editors to improve open practices in the field. A free copy of this paper, the collected data, and the source code are available at https://osf.io/qf9na/",
				"libraryCatalog": "Open Science Framework",
				"repository": "Center for Open Science",
				"rights": "https://creativecommons.org/licenses/by/4.0/legalcode",
				"url": "https://osf.io/8ag3w",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.21468/SciPost.Report.10"
		},
		"items": [
			{
				"itemType": "manuscript",
				"title": "Report on 1607.01285v1",
				"creators": [
					{
						"lastName": "Anonymous Reviewer",
						"fieldMode": 1,
						"creatorType": "author"
					}
				],
				"date": "2016-09-08",
				"libraryCatalog": "Crossref",
				"manuscriptType": "peer review",
				"url": "https://scipost.org/SciPost.Report.10",
				"attachments": [],
				"tags": [],
				"notes": [
					"Review of <a href=\"https://doi.org/10.21468/SciPostPhys.1.1.010\">https://doi.org/10.21468/SciPostPhys.1.1.010</a>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.4086/cjtcs.2012.002"
		},
		"items": [
			{
				"itemType": "journalArticle",
				"title": "[No title found]",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Michael",
						"lastName": "Hoffman"
					},
					{
						"creatorType": "author",
						"firstName": "Jiri",
						"lastName": "Matousek"
					},
					{
						"creatorType": "author",
						"firstName": "Yoshio",
						"lastName": "Okamoto"
					},
					{
						"creatorType": "author",
						"firstName": "Phillipp",
						"lastName": "Zumstein"
					}
				],
				"date": "2012",
				"DOI": "10.4086/cjtcs.2012.002",
				"ISSN": "1073-0486",
				"issue": "1",
				"journalAbbreviation": "Chicago J. of Theoretical Comp. Sci.",
				"language": "en",
				"libraryCatalog": "Crossref",
				"pages": "1-10",
				"publicationTitle": "Chicago Journal of Theoretical Computer Science",
				"url": "http://cjtcs.cs.uchicago.edu/articles/2012/2/contents.html",
				"volume": "18",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1002/9781119011071.iemp0172"
		},
		"items": [
			{
				"itemType": "bookSection",
				"title": "Appreciation and Eudaimonic Reactions to Media",
				"creators": [
					{
						"creatorType": "bookAuthor",
						"firstName": "Allison",
						"lastName": "Eden"
					}
				],
				"date": "2020-09-09",
				"ISBN": "9781119011071",
				"abstractNote": "Entertainment has historically been associated with enjoyment. Yet, many experiences considered under the label of entertainment are not particularly            enjoyable            for viewers, and may instead evoke feelings of sadness, pensiveness, or mixed affect. Attempting to answer the question of why audiences would select media which do not promote hedonic pleasure, researchers have suggested that appreciation may better describe the experience of liking media which provokes mixed affect. Appreciation of media is thought to promote long‐term goals such as life improvement and self‐betterment, in line with the philosophical concept of eudaimonia. This entry examines appreciation‐based responses to media in terms of short‐ and long‐term outcomes.",
				"bookTitle": "The International Encyclopedia of Media Psychology",
				"edition": "1",
				"language": "en",
				"libraryCatalog": "Crossref",
				"pages": "1-9",
				"publisher": "Wiley",
				"rights": "http://doi.wiley.com/10.1002/tdm_license_1.1",
				"url": "https://onlinelibrary.wiley.com/doi/10.1002/9781119011071.iemp0172",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1045/may2016-peng"
		},
		"items": [
			{
				"itemType": "journalArticle",
				"title": "Scientific Stewardship in the Open Data and Big Data Era  Roles and Responsibilities of Stewards and Other Major Product Stakeholders",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Ge",
						"lastName": "Peng"
					},
					{
						"creatorType": "author",
						"firstName": "Nancy A.",
						"lastName": "Ritchey"
					},
					{
						"creatorType": "author",
						"firstName": "Kenneth S.",
						"lastName": "Casey"
					},
					{
						"creatorType": "author",
						"firstName": "Edward J.",
						"lastName": "Kearns"
					},
					{
						"creatorType": "author",
						"firstName": "Jeffrey L.",
						"lastName": "Prevette"
					},
					{
						"creatorType": "author",
						"firstName": "Drew",
						"lastName": "Saunders"
					},
					{
						"creatorType": "author",
						"firstName": "Philip",
						"lastName": "Jones"
					},
					{
						"creatorType": "author",
						"firstName": "Tom",
						"lastName": "Maycock"
					},
					{
						"creatorType": "author",
						"firstName": "Steve",
						"lastName": "Ansari"
					}
				],
				"date": "05/2016",
				"DOI": "10.1045/may2016-peng",
				"ISSN": "1082-9873",
				"issue": "5/6",
				"language": "en",
				"libraryCatalog": "Crossref",
				"publicationTitle": "D-Lib Magazine",
				"url": "http://www.dlib.org/dlib/may16/peng/05peng.html",
				"volume": "22",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1300/J150v03n04_02"
		},
		"items": [
			{
				"itemType": "journalArticle",
				"title": "Service Value Determination: An Integrative Perspective",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Rama K.",
						"lastName": "Jayanti"
					},
					{
						"creatorType": "author",
						"firstName": "Amit K.",
						"lastName": "Ghosh"
					}
				],
				"date": "1996-05-10",
				"DOI": "10.1300/j150v03n04_02",
				"ISSN": "1050-7051, 1541-0897",
				"issue": "4",
				"language": "en",
				"libraryCatalog": "Crossref",
				"pages": "5-25",
				"publicationTitle": "Journal of Hospitality & Leisure Marketing",
				"shortTitle": "Service Value Determination",
				"url": "https://www.tandfonline.com/doi/full/10.1300/J150v03n04_02",
				"volume": "3",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.59350/5znft-x4j11"
		},
		"items": [
			{
				"itemType": "blogPost",
				"title": "QDR Creates New Course on Data Management for CITI",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Sebastian",
						"lastName": "Karcher"
					}
				],
				"date": "2023-03-31",
				"blogTitle": "QDR Blog",
				"rights": "https://creativecommons.org/licenses/by/4.0/legalcode",
				"url": "https://qdr.syr.edu/qdr-blog/qdr-creates-new-course-data-management-citi",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.26509/frbc-wp-200614"
		},
		"items": [
			{
				"itemType": "report",
				"title": "Co-Movement in Sticky Price Models with Durable Goods",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Charles T.",
						"lastName": "Carlstrom"
					},
					{
						"creatorType": "author",
						"firstName": "Timothy Stephen",
						"lastName": "Fuerst"
					}
				],
				"date": "11/2006",
				"institution": "Federal Reserve Bank of Cleveland",
				"libraryCatalog": "Crossref",
				"place": "Cleveland, OH",
				"seriesTitle": "Working paper (Federal Reserve Bank of Cleveland)",
				"url": "https://www.clevelandfed.org/publications/working-paper/wp-0614-co-movement-in-sticky-price-models-with-durable-goods",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.3389/978-2-88966-016-2"
		},
		"items": [
			{
				"itemType": "book",
				"title": "Biobanks as Essential Tools for Translational Research: The Belgian Landscape",
				"creators": [
					{
						"creatorType": "editor",
						"firstName": "Sofie J. S",
						"lastName": "Bekaert"
					},
					{
						"creatorType": "editor",
						"firstName": "Annelies",
						"lastName": "Debucquoy"
					},
					{
						"creatorType": "editor",
						"firstName": "Veronique",
						"lastName": "T’Joen"
					},
					{
						"creatorType": "editor",
						"firstName": "Laurent Georges",
						"lastName": "Dollé"
					},
					{
						"creatorType": "editor",
						"firstName": "Loes",
						"lastName": "Linsen"
					}
				],
				"date": "2020",
				"ISBN": "9782889660162",
				"libraryCatalog": "Crossref",
				"publisher": "Frontiers Media SA",
				"series": "Frontiers Research Topics",
				"shortTitle": "Biobanks as Essential Tools for Translational Research",
				"url": "https://www.frontiersin.org/research-topics/8144/biobanks-as-essential-tools-for-translational-research-the-belgian-landscape",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.18356/31516bf1-en"
		},
		"items": [
			{
				"itemType": "book",
				"title": "Index to Proceedings of the Economic and Social Council",
				"creators": [],
				"libraryCatalog": "Crossref",
				"publisher": "United Nations",
				"url": "https://www.un-ilibrary.org/content/periodicals/24124516",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.7139/2017.978-1-56900-592-7"
		},
		"items": [
			{
				"itemType": "book",
				"title": "Occupational Therapy Manager, 6th Ed",
				"creators": [
					{
						"creatorType": "editor",
						"firstName": "Karen",
						"lastName": "Jacobs"
					},
					{
						"creatorType": "editor",
						"firstName": "Judith",
						"lastName": "Parker Kent"
					},
					{
						"creatorType": "editor",
						"firstName": "Albert",
						"lastName": "Copolillo"
					},
					{
						"creatorType": "editor",
						"firstName": "Roger",
						"lastName": "Ideishi"
					},
					{
						"creatorType": "editor",
						"firstName": "Shawn",
						"lastName": "Phipps"
					},
					{
						"creatorType": "editor",
						"firstName": "Sarah",
						"lastName": "McKinnon"
					},
					{
						"creatorType": "editor",
						"firstName": "Donna",
						"lastName": "Costa"
					},
					{
						"creatorType": "editor",
						"firstName": "Nathan",
						"lastName": "Herz"
					},
					{
						"creatorType": "editor",
						"firstName": "Guy",
						"lastName": "McCormack"
					},
					{
						"creatorType": "editor",
						"firstName": "Lee",
						"lastName": "Brandt"
					},
					{
						"creatorType": "editor",
						"firstName": "Karen",
						"lastName": "Duddy"
					}
				],
				"ISBN": "9781569005927",
				"edition": "6",
				"libraryCatalog": "Crossref",
				"publisher": "AOTA Press",
				"url": "https://library.aota.org/Occupational-Therapy-Manager-6",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.21428/cbd17b20.594a8acc"
		},
		"items": [
			{
				"itemType": "bookSection",
				"title": "Resumen Ejecutivo y Principales Conclusiones",
				"creators": [],
				"date": "2022-09-12",
				"bookTitle": "2022 Global Deep-Sea Capacity Assessment",
				"edition": "1",
				"libraryCatalog": "Crossref",
				"publisher": "Ocean Discovery League, Saunderstown, USA.",
				"url": "https://deepseacapacity.oceandiscoveryleague.org/pub/2022-exec-summary-es",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.11647/obp.0163.08"
		},
		"items": [
			{
				"itemType": "book",
				"title": "Extended dagesh forte: Reading without melody",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Alex",
						"lastName": "Foreman"
					}
				],
				"date": "01/2020",
				"libraryCatalog": "Crossref",
				"publisher": "Open Book Publishers",
				"rights": "http://creativecommons.org/licenses/by/4.0",
				"series": "Semitic Languages and Cultures",
				"shortTitle": "Extended dagesh forte",
				"url": "https://cdn.openbookpublishers.com/resources/10.11647/obp.0163/OBP.0163.08_Gen_1-13_extended_dagesh_forte.mp3",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1021/bk-2009-1027"
		},
		"items": [
			{
				"itemType": "book",
				"title": "Environmental Applications of Nanoscale and Microscale Reactive Metal Particles",
				"creators": [
					{
						"creatorType": "editor",
						"firstName": "Cherie L.",
						"lastName": "Geiger"
					},
					{
						"creatorType": "editor",
						"firstName": "Kathleen M.",
						"lastName": "Carvalho-Knighton"
					}
				],
				"date": "2010-02-01",
				"ISBN": "9780841269927 9780841224674",
				"libraryCatalog": "Crossref",
				"place": "Washington DC",
				"publisher": "American Chemical Society",
				"series": "ACS Symposium Series",
				"url": "https://pubs.acs.org/doi/book/10.1021/bk-2009-1027",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.59317/9789390083503"
		},
		"items": [
			{
				"itemType": "book",
				"title": "Plants for Human Survival and Medicines (Co-Published With Crc Press,Uk)",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Bikarma",
						"lastName": "Singh"
					}
				],
				"date": "2019-07-05",
				"ISBN": "9789390083503",
				"abstractNote": "This book reports the potential plants for human survival, explored medicinal aspects of the ongoing research and development for discovering new molecules, new drugs, new leads, ethnic-traditional applications and nutraceutical values of plants. It provides a baseline data and information on plants and their hidden knowledge for human health. This is build upon based on twenty-five excellent research articles and main focused plant species are Boswellia serrata, Butea monosperma, Colebrookea oppositifolia, Cymbopogon khasianus, Dendrophthe falcata, Dysoxylum binectariferum, Echinacea purpurea, Grewia asiatica, Picrorrhiza kurroa, Saussurea costus, Withania somnifera, Zanthoxylum armatum, different species of Aconitum and Panax, Ashtavarga groups (Habenaria intermedia, Habenaria edgeworthii, Malaxis acuminata, Malaxis muscifera, Lilium polyphyllum, Polygonatum verticillatum, Polygonatum cirrhifolium and Roscoea procera), and hundreds of potential life-saving plants used by different ethnic tribes of Himalaya as food, shelter and medicine in their day-to-day life. Various research studies and clinical trials mentioned in the book will add and contribute a lot in discovering quick leads for medicine formulations and products development. In addition to research suggestions and valuation of plants for humans contained within each of the articles, an introduction section emphasizes particular research avenues for attention in the drug development programmes. As the reader will note, these compilations represent a wide collection of views, reflecting the diversity of sciences and interests of thousands of ideas that enabled thoughtful deliberations from a wide range of scientific perspectives.",
				"libraryCatalog": "Crossref",
				"publisher": "NIPA",
				"url": "https://www.nipaers.com/ebook/9789390083503",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.9734/bpi/hmms/v13/2889f"
		},
		"items": [
			{
				"itemType": "bookSection",
				"title": "A Review on MVD for Trigeminal Neuralgia",
				"creators": [
					{
						"creatorType": "bookAuthor",
						"firstName": "Renuka S.",
						"lastName": "Melkundi"
					},
					{
						"creatorType": "bookAuthor",
						"firstName": "Sateesh",
						"lastName": "Melkundi"
					}
				],
				"date": "2021-07-30",
				"bookTitle": "Highlights on Medicine and Medical Science Vol. 13",
				"libraryCatalog": "Crossref",
				"pages": "108-114",
				"publisher": "Book Publisher International (a part of SCIENCEDOMAIN International)",
				"url": "https://stm.bookpi.org/HMMS-V13/article/view/2729",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.7328/bgbl_2010_0000231_h34"
		},
		"items": [
			{
				"itemType": "bookSection",
				"title": "Dritte Verordnung zur Änderung der Anlageverordnung",
				"creators": [],
				"date": "2010-06-29",
				"bookTitle": "Bundesgesetzblatt",
				"libraryCatalog": "Crossref",
				"pages": "841-845",
				"publisher": "Recht Fuer Deutschland GmbH",
				"url": "http://openurl.makrolog.de/service?url_ver=Z39.88-2004&rft_val_fmt=&rft.gesetzblatt=bd_bgbl&rft.jahrgang=2010&rft.seite=841&svc_id=info:rfd/vkbl",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.14509/23007"
		},
		"items": [
			{
				"itemType": "bookSection",
				"title": "High-resolution lidar data for infrastructure corridors, Wiseman Quadrangle, Alaska",
				"creators": [
					{
						"creatorType": "bookAuthor",
						"firstName": "T. D.",
						"lastName": "Hubbard"
					},
					{
						"creatorType": "bookAuthor",
						"firstName": "M. L.",
						"lastName": "Braun"
					},
					{
						"creatorType": "bookAuthor",
						"firstName": "R. E.",
						"lastName": "Westbrook"
					},
					{
						"creatorType": "bookAuthor",
						"firstName": "P. E.",
						"lastName": "Gallagher"
					}
				],
				"bookTitle": "High-resolution lidar data for Alaska infrastructure corridors",
				"libraryCatalog": "Crossref",
				"publisher": "Alaska Division of Geological & Geophysical Surveys",
				"url": "http://www.dggs.alaska.gov/pubs/id/23007",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1002/0471238961.0308121519200523.a01.pub2"
		},
		"items": [
			{
				"itemType": "bookSection",
				"title": "Chloroprene",
				"creators": [
					{
						"creatorType": "bookAuthor",
						"firstName": "Clare A.",
						"lastName": "Stewart"
					},
					{
						"creatorType": "bookAuthor",
						"firstName": "Updated By",
						"lastName": "Staff"
					}
				],
				"date": "2014-04-28",
				"bookTitle": "Kirk-Othmer Encyclopedia of Chemical Technology",
				"libraryCatalog": "Crossref",
				"pages": "1-9",
				"place": "Hoboken, NJ, USA",
				"publisher": "John Wiley & Sons, Inc.",
				"url": "https://onlinelibrary.wiley.com/doi/10.1002/0471238961.0308121519200523.a01.pub2",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.3403/02199208"
		},
		"items": [
			{
				"itemType": "standard",
				"title": "Non-destructive testing. Acoustic emission. Equipment characterization: Verification of operating characteristic",
				"creators": [],
				"DOI": "10.3403/02199208",
				"libraryCatalog": "Crossref",
				"place": "London",
				"publisher": "BSI British Standards",
				"shortTitle": "Non-destructive testing. Acoustic emission. Equipment characterization",
				"url": "https://linkresolver.bsigroup.com/junction/resolve/000000000030034606?restype=standard",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.4159/dlcl.hippocrates_cos-nature_women.2012"
		},
		"items": [
			{
				"itemType": "dataset",
				"title": "Nature of Women",
				"creators": [
					{
						"creatorType": "author",
						"lastName": "Hippocrates Of Cos",
						"fieldMode": 1
					},
					{
						"creatorType": "translator",
						"firstName": "Paul",
						"lastName": "Potter"
					}
				],
				"date": "2012",
				"DOI": "10.4159/dlcl.hippocrates_cos-nature_women.2012",
				"libraryCatalog": "Crossref",
				"repository": "Harvard University Press",
				"repositoryLocation": "Cambridge, MA",
				"url": "http://www.loebclassics.com/view/hippocrates_cos-nature_women/2012/work.xml",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1036/1097-8542.265870"
		},
		"items": [
			{
				"itemType": "dataset",
				"title": "Food analogs",
				"creators": [],
				"DOI": "10.1036/1097-8542.265870",
				"libraryCatalog": "Crossref",
				"repository": "McGraw-Hill Professional",
				"url": "https://www.accessscience.com/lookup/doi/10.1036/1097-8542.265870",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.2118/29099-ms"
		},
		"items": [
			{
				"itemType": "conferencePaper",
				"title": "Logically Rectangular Mixed Methods for Darcy Flow on General Geometry",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Todd",
						"lastName": "Arbogast"
					},
					{
						"creatorType": "author",
						"firstName": "Philip T.",
						"lastName": "Keenan"
					},
					{
						"creatorType": "author",
						"firstName": "Mary F.",
						"lastName": "Wheeler"
					}
				],
				"date": "1995-02-12",
				"DOI": "10.2118/29099-ms",
				"abstractNote": "ABSTRACT               We consider an expanded mixed finite element formulation (cell centered finite differences) for Darcy flow with a tensor absolute permeability. The reservoir can be geometrically general with internal features, but. the computational domain is rectangular. The method is defined on a curvilinear grid that need not, be orthogonal, obtained by mapping the rectangular, computational grid. The original flow problem becomes a similar problem with a modified permeability on the computational grid. Quadrature rules turn the mixed method into a cell-centered finite difference method with a. 9 point stencil in 2-D and 19 in 3-D.               As shown by theory and experiment, if the modified permeability on the computational domain is smooth, then the convergence rate is optimal and both pressure and velocity are superconvergent at certain points. If not, Lagrange multiplier pressures can be introduced on boundaries of elements so that optimal convergence is retained. This modification presents only small changes in the solution process; in fact, the same parallel domain decomposition algorithms can be applied with little or no change to the code if the modified permeability is smooth over the subdomains.               This Lagrange multiplier procedure can be. used to extend the difference scheme to multi-block domains, and to give, a coupling with unstructured grids. In all cases, the mixed formulation is locally conservative. Computational results illustrate the advantage and convergence of this method.",
				"conferenceName": "SPE Reservoir Simulation Symposium",
				"libraryCatalog": "Crossref",
				"place": "San Antonio, Texas",
				"proceedingsTitle": "All Days",
				"publisher": "SPE",
				"url": "https://onepetro.org/spersc/proceedings/95RSS/All-95RSS/SPE-29099-MS/61095",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.14264/105901"
		},
		"items": [
			{
				"itemType": "thesis",
				"title": "Synthetic and structural studies towards novel backbone peptidomimetics",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Michael John.",
						"lastName": "Kelso"
					}
				],
				"date": "2002-02-02",
				"libraryCatalog": "Crossref",
				"thesisType": "PhD Thesis",
				"university": "University of Queensland Library",
				"url": "https://espace.library.uq.edu.au/view/UQ:105901",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1101/2020.04.07.20057075"
		},
		"items": [
			{
				"itemType": "preprint",
				"title": "A simple method to quantify country-specific effects of COVID-19 containment measures",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Morten Gram",
						"lastName": "Pedersen"
					},
					{
						"creatorType": "author",
						"firstName": "Matteo",
						"lastName": "Meneghini"
					}
				],
				"date": "2020-04-10",
				"DOI": "10.1101/2020.04.07.20057075",
				"abstractNote": "AbstractMost of the world is currently fighting to limit the impact of the COVID-19 pandemic. Italy, the Western country with most COVID-19 related deaths, was the first to implement drastic containment measures in early March, 2020. Since then most other European countries, the USA, Canada and Australia, have implemented similar restrictions, ranging from school closures, banning of recreational activities and large events, to complete lockdown. Such limitations, and softer promotion of social distancing, may be more effective in one society than in another due to cultural or political differences. It is therefore important to evaluate the effectiveness of these initiatives by analyzing country-specific COVID-19 data. We propose to model COVID-19 dynamics with a SIQR (susceptible – infectious – quarantined – recovered) model, since confirmed positive cases are isolated and do not transmit the disease. We provide an explicit formula that is easily implemented and permits us to fit official COVID-19 data in a series of Western countries. We found excellent agreement with data-driven estimation of the day-of-change in disease dynamics and the dates when official interventions were introduced. Our analysis predicts that for most countries only the more drastic restrictions have reduced virus spreading. Further, we predict that the number of unidentified COVID-19-positive individuals at the beginning of the epidemic is ∼10 times the number of confirmed cases. Our results provide important insight for future planning of non-pharmacological interventions aiming to contain spreading of COVID-19 and similar diseases.",
				"libraryCatalog": "Public and Global Health",
				"repository": "Cold Spring Harbor Laboratory",
				"url": "http://medrxiv.org/lookup/doi/10.1101/2020.04.07.20057075",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.32388/tqr2ys"
		},
		"items": [
			{
				"itemType": "manuscript",
				"title": "Review of: \"Stakeholders' Perception of Socioecological Factors Influencing Forest Elephant Crop Depredation in Gabon, Central Africa\"",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Abel",
						"lastName": "Mamboleo"
					}
				],
				"date": "2024-02-21",
				"libraryCatalog": "Crossref",
				"manuscriptType": "peer review",
				"shortTitle": "Review of",
				"url": "https://www.qeios.com/read/TQR2YS",
				"attachments": [],
				"tags": [],
				"notes": [
					"Review of <a href=\"https://doi.org/10.32388/XSM9RG\">https://doi.org/10.32388/XSM9RG</a>"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1039/9781847557766"
		},
		"items": [
			{
				"itemType": "book",
				"title": "Nanotechnology: Consequences for Human Health and the Environment",
				"creators": [
					{
						"creatorType": "editor",
						"firstName": "R E",
						"lastName": "Hester"
					},
					{
						"creatorType": "editor",
						"firstName": "R M",
						"lastName": "Harrison"
					}
				],
				"date": "2007",
				"ISBN": "9780854042166",
				"libraryCatalog": "Crossref",
				"place": "Cambridge",
				"publisher": "Royal Society of Chemistry",
				"series": "Issues in Environmental Science and Technology",
				"shortTitle": "Nanotechnology",
				"url": "http://ebook.rsc.org/?DOI=10.1039/9781847557766",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.3133/sir20175014"
		},
		"items": [
			{
				"itemType": "report",
				"title": "Effects of changes in pumping on regional groundwater-flow paths, 2005 and 2010, and areas contributing recharge to discharging wells, 1990–2010, in the vicinity of North Penn Area 7 Superfund site, Montgomery County, Pennsylvania",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Lisa A.",
						"lastName": "Senior"
					},
					{
						"creatorType": "author",
						"firstName": "Daniel J.",
						"lastName": "Goode"
					}
				],
				"date": "2017",
				"institution": "US Geological Survey",
				"libraryCatalog": "Crossref",
				"seriesTitle": "Scientific Investigations Report",
				"url": "https://pubs.usgs.gov/publication/sir20175014",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.14305/jn.19440413.2023.15"
		},
		"items": [
			{
				"itemType": "journalArticle",
				"title": "[No title found]",
				"creators": [],
				"DOI": "10.14305/jn.19440413.2023.15",
				"ISSN": "1944-0413, 1944-0413",
				"language": "en",
				"libraryCatalog": "Crossref",
				"publicationTitle": "Excelsior: Leadership in Teaching and Learning",
				"url": "https://surface.syr.edu/excelsior/vol15",
				"volume": "15",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1002/(issn)1099-1751"
		},
		"items": [
			{
				"itemType": "journalArticle",
				"title": "The International Journal of Health Planning and Management",
				"creators": [],
				"DOI": "10.1002/(issn)1099-1751",
				"ISSN": "0749-6753, 1099-1751",
				"language": "en",
				"libraryCatalog": "Crossref",
				"url": "http://doi.wiley.com/10.1002/%28ISSN%291099-1751",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1111/ceo.v49.2"
		},
		"items": [
			{
				"itemType": "journalArticle",
				"title": "[No title found]",
				"creators": [],
				"date": "03/2021",
				"DOI": "10.1111/ceo.v49.2",
				"ISSN": "1442-6404, 1442-9071",
				"issue": "2",
				"journalAbbreviation": "Clinical Exper Ophthalmology",
				"language": "en",
				"libraryCatalog": "Crossref",
				"publicationTitle": "Clinical & Experimental Ophthalmology",
				"url": "https://onlinelibrary.wiley.com/toc/14429071/49/2",
				"volume": "49",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1021/acsami.3c09983.s001"
		},
		"items": [
			{
				"itemType": "document",
				"title": "Multifunctional Ti3C2Tx MXene/Silver Nanowire Membranes with Excellent Catalytic Antifouling, and Antibacterial Properties for Nitrophenol-Containing Water Purification",
				"creators": [],
				"libraryCatalog": "Crossref",
				"publisher": "American Chemical Society (ACS)",
				"url": "https://pubs.acs.org/doi/suppl/10.1021/acsami.3c09983/suppl_file/am3c09983_si_001.pdf",
				"attachments": [],
				"tags": [],
				"notes": [
					"Supplemental Information for 10.1021/acsami.3c09983"
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.15405/epsbs(2357-1330).2021.6.1"
		},
		"items": [
			{
				"itemType": "conferencePaper",
				"title": "European Proceedings of Social and Behavioural Sciences",
				"creators": [],
				"DOI": "10.15405/epsbs(2357-1330).2021.6.1",
				"conferenceName": "Psychosocial Risks in Education and Quality Educational Processes",
				"libraryCatalog": "Crossref",
				"publisher": "European Publisher",
				"url": "https://europeanproceedings.com/book-series/EpSBS/books/vol109-cipe-2020",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.1145/1947940"
		},
		"items": [
			{
				"itemType": "conferencePaper",
				"title": "Proceedings of the 2011 International Conference on Communication, Computing & Security - ICCCS '11",
				"creators": [],
				"date": "2011",
				"DOI": "10.1145/1947940",
				"ISBN": "9781450304641",
				"conferenceName": "the 2011 International Conference",
				"libraryCatalog": "Crossref",
				"place": "Rourkela, Odisha, India",
				"publisher": "ACM Press",
				"url": "http://portal.acm.org/citation.cfm?doid=1947940",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "import",
		"input": "{\"status\":\"ok\",\"message-type\":\"work-list\",\"message-version\":\"1.0.0\",\"message\":{\"facets\":{},\"total-results\":3,\"items\":[{\"indexed\":{\"date-parts\":[[2024,3,15]],\"date-time\":\"2024-03-15T00:38:55Z\",\"timestamp\":1710463135235},\"reference-count\":111,\"publisher\":\"MDPI AG\",\"issue\":\"1\",\"license\":[{\"start\":{\"date-parts\":[[2024,3,14]],\"date-time\":\"2024-03-14T00:00:00Z\",\"timestamp\":1710374400000},\"content-version\":\"vor\",\"delay-in-days\":0,\"URL\":\"https:\\/\\/creativecommons.org\\/licenses\\/by\\/4.0\\/\"}],\"funder\":[{\"name\":\"Fonds National de la Recherche Luxembourg\",\"award\":[\"C20\\/IS\\/14616644\",\"O20\\/14776480\"]}],\"content-domain\":{\"domain\":[],\"crossmark-restriction\":false},\"short-container-title\":[\"Logics\"],\"abstract\":\"<jats:p>The logico-pluralist LogiKEy knowledge engineering methodology and framework is applied to the modelling of a theory of legal balancing, in which legal knowledge (cases and laws) is encoded by utilising context-dependent value preferences. The theory obtained is then used to formalise, automatically evaluate, and reconstruct illustrative property law cases (involving the appropriation of wild animals) within the Isabelle\\/HOL proof assistant system, illustrating how LogiKEy can harness interactive and automated theorem-proving technology to provide a testbed for the development and formal verification of legal domain-specific languages and theories. Modelling value-oriented legal reasoning in that framework, we establish novel bridges between the latest research in knowledge representation and reasoning in non-classical logics, automated theorem proving, and applications in legal reasoning.<\\/jats:p>\",\"DOI\":\"10.3390\\/logics2010003\",\"type\":\"journal-article\",\"created\":{\"date-parts\":[[2024,3,14]],\"date-time\":\"2024-03-14T09:43:30Z\",\"timestamp\":1710409410000},\"page\":\"31-78\",\"source\":\"Crossref\",\"is-referenced-by-count\":0,\"title\":[\"Modelling Value-Oriented Legal Reasoning in LogiKEy\"],\"prefix\":\"10.3390\",\"volume\":\"2\",\"author\":[{\"ORCID\":\"http:\\/\\/orcid.org\\/0000-0002-3392-3093\",\"authenticated-orcid\":false,\"given\":\"Christoph\",\"family\":\"Benzm\\u00fcller\",\"sequence\":\"first\",\"affiliation\":[{\"name\":\"AI Systems Engineering, University of Bamberg, 96045 Bamberg, Germany\"},{\"name\":\"Department of Mathematics and Computer Science, Freie Universit\\u00e4t Berlin, 14195 Berlin, Germany\"}]},{\"ORCID\":\"http:\\/\\/orcid.org\\/0000-0002-0042-4538\",\"authenticated-orcid\":false,\"given\":\"David\",\"family\":\"Fuenmayor\",\"sequence\":\"additional\",\"affiliation\":[{\"name\":\"AI Systems Engineering, University of Bamberg, 96045 Bamberg, Germany\"},{\"name\":\"Department of Mathematics and Computer Science, Freie Universit\\u00e4t Berlin, 14195 Berlin, Germany\"}]},{\"ORCID\":\"http:\\/\\/orcid.org\\/0000-0002-4163-8364\",\"authenticated-orcid\":false,\"given\":\"Bertram\",\"family\":\"Lomfeld\",\"sequence\":\"additional\",\"affiliation\":[{\"name\":\"Department of Law, Freie Universit\\u00e4t Berlin, 14195 Berlin, Germany\"}]}],\"member\":\"1968\",\"published-online\":{\"date-parts\":[[2024,3,14]]},\"reference\":[{\"key\":\"ref_1\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"239\",\"DOI\":\"10.2307\\/3053348\",\"article-title\":\"Substantive and Reflexive Elements in Modern Law\",\"volume\":\"17\",\"author\":\"Teubner\",\"year\":\"1983\",\"journal-title\":\"Law Soc. Rev.\"},{\"key\":\"ref_2\",\"unstructured\":\"Lomfeld, B. (2017). Die F\\u00e4lle der Gesellschaft: Eine neue Praxis Soziologischer Jurisprudenz, Mohr Siebeck.\"},{\"key\":\"ref_3\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"103348\",\"DOI\":\"10.1016\\/j.artint.2020.103348\",\"article-title\":\"Designing Normative Theories for Ethical and Legal Reasoning: LogiKEy Framework, Methodology, and Tool Support\",\"volume\":\"287\",\"author\":\"Parent\",\"year\":\"2020\",\"journal-title\":\"Artif. Intell.\"},{\"key\":\"ref_4\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"516\",\"DOI\":\"10.5771\\/0023-4834-2019-4-516\",\"article-title\":\"Grammatik der Rechtfertigung: Eine kritische Rekonstruktion der Rechts(fort)bildung\",\"volume\":\"52\",\"author\":\"Lomfeld\",\"year\":\"2019\",\"journal-title\":\"Krit. Justiz\"},{\"key\":\"ref_5\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"97\",\"DOI\":\"10.1016\\/S0004-3702(03)00108-5\",\"article-title\":\"A model of legal reasoning with cases incorporating theories and value\",\"volume\":\"150\",\"author\":\"Sartor\",\"year\":\"2003\",\"journal-title\":\"Artif. Intell.\"},{\"key\":\"ref_6\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Berman, D., and Hafner, C. (1993, January 15\\u201318). Representing teleological structure in case-based legal reasoning: The missing link. Proceedings of the 4th International Conference on Artificial Intelligence and Law, Amsterdam The Netherlands.\",\"DOI\":\"10.1145\\/158976.158982\"},{\"key\":\"ref_7\",\"unstructured\":\"Merrill, T.W., and Smith, H.E. (2017). Property: Principles and Policies, Foundation Press.\"},{\"key\":\"ref_8\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"213\",\"DOI\":\"10.3233\\/SW-160224\",\"article-title\":\"Semantic Web for the Legal Domain: The next step\",\"volume\":\"7\",\"author\":\"Casanovas\",\"year\":\"2016\",\"journal-title\":\"Semant. Web\"},{\"key\":\"ref_9\",\"first-page\":\"21\",\"article-title\":\"LKIF Core: Principled Ontology Development for the Legal Domain\",\"volume\":\"Volume 188\",\"author\":\"Breuker\",\"year\":\"2009\",\"journal-title\":\"Law, Ontologies and the Semantic Web\\u2014Channelling the Legal Information Flood\"},{\"key\":\"ref_10\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"48\",\"DOI\":\"10.1016\\/j.scico.2018.10.008\",\"article-title\":\"Universal (Meta-)Logical Reasoning: Recent Successes\",\"volume\":\"172\",\"year\":\"2019\",\"journal-title\":\"Sci. Comput. Program.\"},{\"key\":\"ref_11\",\"first-page\":\"12\",\"article-title\":\"Four kinds of ethical robots\",\"volume\":\"72\",\"author\":\"Moor\",\"year\":\"2009\",\"journal-title\":\"Philos. Now\"},{\"key\":\"ref_12\",\"first-page\":\"57\",\"article-title\":\"The Case for Explicit Ethical Agents\",\"volume\":\"38\",\"author\":\"Scheutz\",\"year\":\"2017\",\"journal-title\":\"AI Mag.\"},{\"key\":\"ref_13\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Arkin, R.C., Ulam, P., and Duncan, B.A. (2009). An Ethical Governor for Constraining Lethal Action in an Autonomous System, Georgia Institute of Technology. Technical Report GVU-09-02.\",\"DOI\":\"10.21236\\/ADA493563\"},{\"key\":\"ref_14\",\"first-page\":\"23:1\",\"article-title\":\"Value-oriented Legal Argumentation in Isabelle\\/HOL\",\"volume\":\"Volume 193\",\"author\":\"Cohen\",\"year\":\"2021\",\"journal-title\":\"International Conference on Interactive Theorem Proving (ITP), Proceedings\"},{\"key\":\"ref_15\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"83\",\"DOI\":\"10.1007\\/s10992-008-9085-3\",\"article-title\":\"Everything Else Being Equal: A Modal Logic for Ceteris Paribus Prefer\",\"volume\":\"38\",\"author\":\"Girard\",\"year\":\"2009\",\"journal-title\":\"J. Philos. Log.\"},{\"key\":\"ref_16\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"214\",\"DOI\":\"10.1016\\/j.artint.2015.06.005\",\"article-title\":\"Law and logic: A review from an argumentation perspective\",\"volume\":\"227\",\"author\":\"Prakken\",\"year\":\"2015\",\"journal-title\":\"Artif. Intell.\"},{\"key\":\"ref_17\",\"unstructured\":\"Alexy, R. (1978). Theorie der juristischen Argumentation, Suhrkamp.\"},{\"key\":\"ref_18\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Feteris, E. (2017). Fundamentals of Legal Argumentation, Springer.\",\"DOI\":\"10.1007\\/978-94-024-1129-4\"},{\"key\":\"ref_19\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Hage, J. (1997). Reasoning with Rules, Kluwer.\",\"DOI\":\"10.1007\\/978-94-015-8873-7\"},{\"key\":\"ref_20\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Prakken, H. (1997). Logical Tools for Modelling Legal Argument, Springer.\",\"DOI\":\"10.1007\\/978-94-015-8975-8\"},{\"key\":\"ref_21\",\"unstructured\":\"Baroni, P., Gabbay, D., Giacomin, M., and van der Torre, L. (2018). Handbook of Formal Argumentation, College Publications.\"},{\"key\":\"ref_22\",\"unstructured\":\"Ashley, K.D. (1990). Modelling Legal Argument: Reasoning with Cases and Hypotheticals, MIT Press.\"},{\"key\":\"ref_23\",\"unstructured\":\"Aleven, V. (1997). Teaching Case-Based Reasoning through a Model and Examples. [Ph.D. Dissertation, University of Pittsburgh].\"},{\"key\":\"ref_24\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"1\",\"DOI\":\"10.1017\\/S1352325211000036\",\"article-title\":\"Rules and reasons in the theory of precedent\",\"volume\":\"17\",\"author\":\"Horty\",\"year\":\"2011\",\"journal-title\":\"Leg. Theory\"},{\"key\":\"ref_25\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"1075\",\"DOI\":\"10.1093\\/logcom\\/exi058\",\"article-title\":\"Persuasion and value in legal argument\",\"volume\":\"15\",\"author\":\"Atkinson\",\"year\":\"2005\",\"journal-title\":\"J. Log. Comput.\"},{\"key\":\"ref_26\",\"unstructured\":\"Grabmair, M. (2016). Modeling Purposive Legal Argumentation and Case Outcome Prediction Using Argument Schemes in the Value Judgment Formalism. [Ph.D. Dissertation].\"},{\"key\":\"ref_27\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Maranh\\u00e3o, J., and Sartor, G. (2019, January 17\\u201321). Value assessment and revision in legal interpretation. Proceedings of the Seventeenth International Conference on Artificial Intelligence and Law, ICAIL 2019, Montreal, QC, Canada.\",\"DOI\":\"10.1145\\/3322640.3326709\"},{\"key\":\"ref_28\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Lomfeld, B. (2015). Die Gr\\u00fcnde des Vertrages: Eine Diskurstheorie der Vertragsrechte, Mohr Siebeck.\",\"DOI\":\"10.1628\\/978-3-16-154445-3\"},{\"key\":\"ref_29\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"433\",\"DOI\":\"10.1046\\/j.0952-1917.2003.00244.x\",\"article-title\":\"On Balancing and Subsumption: A Structural Comparison\",\"volume\":\"16\",\"author\":\"Alexy\",\"year\":\"2003\",\"journal-title\":\"Ratio Juris\"},{\"key\":\"ref_30\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"175\",\"DOI\":\"10.1007\\/s10506-010-9095-7\",\"article-title\":\"Doing justice to rights and values: Teleological reasoning and proportionality\",\"volume\":\"18\",\"author\":\"Sartor\",\"year\":\"2010\",\"journal-title\":\"Artif. Intell. Law\"},{\"key\":\"ref_31\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Bongiovanni, G., Postema, G., Rotolo, A., Sartor, G., Valentini, C., and Walton, D. (2018). Handbook of Legal Reasoning and Argumentation, Springer.\",\"DOI\":\"10.1007\\/978-90-481-9452-0\"},{\"key\":\"ref_32\",\"unstructured\":\"Dworkin, R. (1978). Taking Rights Seriously, Harvard University Press. OCLC: 4313351.\"},{\"key\":\"ref_33\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"294\",\"DOI\":\"10.1111\\/1467-9337.00157\",\"article-title\":\"On the Structure of Legal Principles\",\"volume\":\"13\",\"author\":\"Alexy\",\"year\":\"2000\",\"journal-title\":\"Ratio Juris\"},{\"key\":\"ref_34\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"823\",\"DOI\":\"10.2307\\/795152\",\"article-title\":\"Legal Principles and the Limits of Law\",\"volume\":\"81\",\"author\":\"Raz\",\"year\":\"1972\",\"journal-title\":\"Yale Law J.\"},{\"key\":\"ref_35\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"3\",\"DOI\":\"10.1023\\/A:1008247812801\",\"article-title\":\"An integrated view on rules and principles\",\"volume\":\"6\",\"author\":\"Verheij\",\"year\":\"1998\",\"journal-title\":\"Artif. Intell. Law\"},{\"key\":\"ref_36\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Neves, M. (2021). Constitutionalism and the Paradox of Principles and Rules, Oxford University Press.\",\"DOI\":\"10.1093\\/oso\\/9780192898746.001.0001\"},{\"key\":\"ref_37\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Barak, A. (2012). Proportionality, Cambridge University Press.\",\"DOI\":\"10.1017\\/CBO9781139035293\"},{\"key\":\"ref_38\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"McBurney, P., Rahwan, I., Parsons, S., and Maudet, N. (2010). Argumentation in Multi-Agent Systems (ArgMAS), Springer.\",\"DOI\":\"10.1007\\/978-3-642-12805-9\"},{\"key\":\"ref_39\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"199\",\"DOI\":\"10.1006\\/knac.1993.1008\",\"article-title\":\"A Translation Approach to Portable Ontology Specifications\",\"volume\":\"5\",\"author\":\"Gruber\",\"year\":\"1993\",\"journal-title\":\"Knowl. Acquis.\"},{\"key\":\"ref_40\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Liu, L., and \\u00d6zsu, M.T. (2009). Encyclopedia of Database Systems, Springer.\",\"DOI\":\"10.1007\\/978-0-387-39940-9\"},{\"key\":\"ref_41\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Floridi, L. (2003). Blackwell Guide to the Philosophy of Computing and Information, Blackwell.\",\"DOI\":\"10.1111\\/b.9780631229193.2003.00002.x\"},{\"key\":\"ref_42\",\"unstructured\":\"Rokeach, M. (1973). The Nature of Human Values, Free Press Macmillan.\"},{\"key\":\"ref_43\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"1\",\"DOI\":\"10.1016\\/S0065-2601(08)60281-6\",\"article-title\":\"Universals in the Content and Structure of Values\",\"volume\":\"25\",\"author\":\"Schwartz\",\"year\":\"1992\",\"journal-title\":\"Adv. Exp. Soc. Psychol.\"},{\"key\":\"ref_44\",\"unstructured\":\"Eysenck, H. (1954). The Psychology of Politics, Routledge.\"},{\"key\":\"ref_45\",\"unstructured\":\"Mitchell, B. (2007). Eight Ways to Run the Country, Praeger.\"},{\"key\":\"ref_46\",\"unstructured\":\"Clark, B. (1991). Political Economy: A Comparative Approach, Praeger.\"},{\"key\":\"ref_47\",\"unstructured\":\"Hofstede, G. (2001). Culture\\u2019s Consequences, Sage.\"},{\"key\":\"ref_48\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Inglehart, R. (2018). Cultural Evolution, Cambridge University Press.\",\"DOI\":\"10.1017\\/9781108613880\"},{\"key\":\"ref_49\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"103239\",\"DOI\":\"10.1016\\/j.artint.2020.103239\",\"article-title\":\"Ethical approaches and autonomous systems\",\"volume\":\"281\",\"year\":\"2020\",\"journal-title\":\"Artif. Intell.\"},{\"key\":\"ref_50\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"95\",\"DOI\":\"10.1023\\/A:1019589831118\",\"article-title\":\"Teleological arguments and theory-based dialectics\",\"volume\":\"10\",\"author\":\"Sartor\",\"year\":\"2002\",\"journal-title\":\"Artif. Intell. Law\"},{\"key\":\"ref_51\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"113\",\"DOI\":\"10.1023\\/A:1019536206548\",\"article-title\":\"An exercise in formalising teleological case-based reasoning\",\"volume\":\"10\",\"author\":\"Prakken\",\"year\":\"2002\",\"journal-title\":\"Artif. Intell. Law\"},{\"key\":\"ref_52\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"15\",\"DOI\":\"10.1007\\/s10506-012-9118-7\",\"article-title\":\"Representing Popov v Hayashi with dimensions and factors\",\"volume\":\"20\",\"year\":\"2012\",\"journal-title\":\"Artif. Intell. Law\"},{\"key\":\"ref_53\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"37\",\"DOI\":\"10.1007\\/s10506-012-9120-0\",\"article-title\":\"A Carneades reconstruction of Popov v Hayashi\",\"volume\":\"20\",\"author\":\"Gordon\",\"year\":\"2012\",\"journal-title\":\"Artif. Intell. Law\"},{\"key\":\"ref_54\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"153\",\"DOI\":\"10.1007\\/s10506-010-9094-8\",\"article-title\":\"Using argument schemes for hypothetical reasoning in law\",\"volume\":\"18\",\"author\":\"Prakken\",\"year\":\"2010\",\"journal-title\":\"Artif. Intell. Law\"},{\"key\":\"ref_55\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"323\",\"DOI\":\"10.1007\\/s10506-006-9016-y\",\"article-title\":\"An empirical investigation of reasoning with legal cases through theory construction and application\",\"volume\":\"13\",\"author\":\"Chorley\",\"year\":\"2005\",\"journal-title\":\"Artif. Intell. Law\"},{\"key\":\"ref_56\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"205\",\"DOI\":\"10.1007\\/s10506-017-9201-1\",\"article-title\":\"Hypo\\u2019s legacy: Introduction to the virtual special issue\",\"volume\":\"25\",\"year\":\"2017\",\"journal-title\":\"Artif. Intell. Law\"},{\"key\":\"ref_57\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"387\",\"DOI\":\"10.1007\\/s10506-016-9189-y\",\"article-title\":\"Formalizing value-guided argumentation for ethical systems design\",\"volume\":\"24\",\"author\":\"Verheij\",\"year\":\"2016\",\"journal-title\":\"Artif. Intell. Law\"},{\"key\":\"ref_58\",\"unstructured\":\"Zalta, E.N. (2019). The Stanford Encyclopedia of Philosophy, Metaphysics Research Lab, Stanford University. [Summer 2019 ed.].\"},{\"key\":\"ref_59\",\"unstructured\":\"Jeuring, J., and Chakravarty, M.M.T. (2014, January 1\\u20133). Folding domain-specific languages: Deep and shallow embeddings (functional Pearl). Proceedings of the 19th ACM SIGPLAN International Conference on Functional Programming, Gothenburg, Sweden.\"},{\"key\":\"ref_60\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Loidl, H.W., and Pe\\u00f1a, R. (2013). Trends in Functional Programming, Springer.\",\"DOI\":\"10.1007\\/978-3-642-40447-4\"},{\"key\":\"ref_61\",\"first-page\":\"101\",\"article-title\":\"Hammering towards QED\",\"volume\":\"9\",\"author\":\"Blanchette\",\"year\":\"2016\",\"journal-title\":\"J. Formaliz. Reason.\"},{\"key\":\"ref_62\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"McCarty, L.T. (1995, January 21\\u201324). An implementation of Eisner v. Macomber. Proceedings of the 5th International Conference on Artificial Intelligence and Law, College Park, MD, USA.\",\"DOI\":\"10.1145\\/222092.222258\"},{\"key\":\"ref_63\",\"first-page\":\"441\",\"article-title\":\"A Computational-Hermeneutic Approach for Conceptual Explicitation\",\"volume\":\"Volume 49\",\"author\":\"Nepomuceno\",\"year\":\"2019\",\"journal-title\":\"Model-Based Reasoning in Science and Technology. Inferential Models for Logic, Language, Cognition and Computation\"},{\"key\":\"ref_64\",\"unstructured\":\"Zalta, E.N. (2020). The Stanford Encyclopedia of Philosophy, Metaphysics Research Lab, Stanford University. [Summer 2020 ed.].\"},{\"key\":\"ref_65\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Rawls, J. (1971). A Theory of Justice, Harvard University Press. Revised edition 1999.\",\"DOI\":\"10.4159\\/9780674042582\"},{\"key\":\"ref_66\",\"unstructured\":\"Goodman, N. (1955). Fact, Fiction, and Forecast, Harvard University Press.\"},{\"key\":\"ref_67\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"385\",\"DOI\":\"10.2307\\/2272981\",\"article-title\":\"General Models, Descriptions, and Choice in Type Theory\",\"volume\":\"37\",\"author\":\"Andrews\",\"year\":\"1972\",\"journal-title\":\"J. Symb. Log.\"},{\"key\":\"ref_68\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"395\",\"DOI\":\"10.2307\\/2272982\",\"article-title\":\"General Models and Extensionality\",\"volume\":\"37\",\"author\":\"Andrews\",\"year\":\"1972\",\"journal-title\":\"J. Symb. Log.\"},{\"key\":\"ref_69\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"1027\",\"DOI\":\"10.2178\\/jsl\\/1102022211\",\"article-title\":\"Higher-Order Semantics and Extensionality\",\"volume\":\"69\",\"author\":\"Brown\",\"year\":\"2004\",\"journal-title\":\"J. Symb. Log.\"},{\"key\":\"ref_70\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Gabbay, D.M., Siekmann, J.H., and Woods, J. (2014). Handbook of the History of Logic, Volume 9\\u2014Computational Logic, Elsevier.\",\"DOI\":\"10.1016\\/B978-0-444-51624-4.50001-0\"},{\"key\":\"ref_71\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"56\",\"DOI\":\"10.2307\\/2266170\",\"article-title\":\"A Formulation of the Simple Theory of Types\",\"volume\":\"5\",\"author\":\"Church\",\"year\":\"1940\",\"journal-title\":\"J. Symb. Log.\"},{\"key\":\"ref_72\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"305\",\"DOI\":\"10.1007\\/BF01448013\",\"article-title\":\"\\u00dcber die Bausteine der mathematischen Logik\",\"volume\":\"92\",\"year\":\"1924\",\"journal-title\":\"Math. Ann.\"},{\"key\":\"ref_73\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"81\",\"DOI\":\"10.2307\\/2266967\",\"article-title\":\"Completeness in the Theory of Types\",\"volume\":\"15\",\"author\":\"Henkin\",\"year\":\"1950\",\"journal-title\":\"J. Symb. Log.\"},{\"key\":\"ref_74\",\"unstructured\":\"Von Wright, G.H. (1963). The Logic of Preference, Edinburgh University Press.\"},{\"key\":\"ref_75\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"881\",\"DOI\":\"10.1093\\/jigpal\\/jzp080\",\"article-title\":\"Multimodal and Intuitionistic Logics in Simple Type Theory\",\"volume\":\"18\",\"author\":\"Paulson\",\"year\":\"2010\",\"journal-title\":\"Log. J. IGPL\"},{\"key\":\"ref_76\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"7\",\"DOI\":\"10.1007\\/s11787-012-0052-y\",\"article-title\":\"Quantified Multimodal Logics in Simple Type Theory\",\"volume\":\"7\",\"author\":\"Paulson\",\"year\":\"2013\",\"journal-title\":\"Log. Universalis\"},{\"key\":\"ref_77\",\"unstructured\":\"Zalta, E.N. (2020). The Stanford Encyclopedia of Philosophy, Metaphysics Research Lab, Stanford University. [Fall 2020 ed.].\"},{\"key\":\"ref_78\",\"unstructured\":\"Carnielli, W., Coniglio, M., Gabbay, D.M., Paula, G., and Sernadas, C. (2008). Analysis and Synthesis of Logics, Springer.\"},{\"key\":\"ref_79\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"1\",\"DOI\":\"10.1613\\/jair.391\",\"article-title\":\"Defining relative likelihood in partially-ordered preferential structures\",\"volume\":\"7\",\"author\":\"Halpern\",\"year\":\"1997\",\"journal-title\":\"J. Artif. Intell. Res.\"},{\"key\":\"ref_80\",\"unstructured\":\"Liu, F. (2008). Changing for the Better: Preference Dynamics and Agent Diversity. [Ph.D. Thesis, Institute for Logic, Language and Computation, Universiteit van Amsterdam].\"},{\"key\":\"ref_81\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"333\",\"DOI\":\"10.1007\\/s10992-016-9403-0\",\"article-title\":\"Cut-Elimination for Quantified Conditional Logic\",\"volume\":\"46\",\"year\":\"2017\",\"journal-title\":\"J. Philos. Log.\"},{\"key\":\"ref_82\",\"first-page\":\"715\",\"article-title\":\"I\\/O Logic in HOL\",\"volume\":\"6\",\"author\":\"Farjami\",\"year\":\"2019\",\"journal-title\":\"J. Appl. Logics\\u2014IfCoLoG J. Logics Their Appl.\"},{\"key\":\"ref_83\",\"first-page\":\"733\",\"article-title\":\"\\u00c5qvist\\u2019s Dyadic Deontic Logic E in HOL\",\"volume\":\"6\",\"author\":\"Farjami\",\"year\":\"2019\",\"journal-title\":\"J. Appl. Logics\\u2014IfCoLoG J. Logics Their Appl.\"},{\"key\":\"ref_84\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Rahman, S., Armgardt, M., Kvernenes, N., and Christian, H. (2022). New Developments in Legal Reasoning and Logic: From Ancient Law to Modern Legal Systems, Springer Nature. Logic, Argumentation & Reasoning.\",\"DOI\":\"10.1007\\/978-3-030-70084-3\"},{\"key\":\"ref_85\",\"first-page\":\"1243\",\"article-title\":\"Automating Public Announcement Logic with Relativized Common Knowledge as a Fragment of HOL in LogiKEy\",\"volume\":\"33\",\"author\":\"Reiche\",\"year\":\"2022\",\"journal-title\":\"J. Log. Comput.\"},{\"key\":\"ref_86\",\"unstructured\":\"Parent, X., and Benzm\\u00fcller, C. (2024). Normative conditional reasoning as a fragment of HOL. arXiv Preprint.\"},{\"key\":\"ref_87\",\"unstructured\":\"Kirchner, D. (2022). Computer-Verified Foundations of Metaphysics and an Ontology of Natural Numbers in Isabelle\\/HOL. [Ph.D. Thesis, Freie Universit\\u00e4t Berlin].\"},{\"key\":\"ref_88\",\"unstructured\":\"Boutilier, C. (1994). Principles of Knowledge Representation and Reasoning, Elsevier.\"},{\"key\":\"ref_89\",\"unstructured\":\"Lewis, D. (1973). Counterfactuals, Harvard University Press.\"},{\"key\":\"ref_90\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Gr\\u00fcne-Yanoff, T., and Hansson, S.O. (2009). Preference Change: Approaches from Philosophy, Economics and Psychology, Springer.\",\"DOI\":\"10.1007\\/978-90-481-2593-7\"},{\"key\":\"ref_91\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Liu, F. (2011). Reasoning about Preference Dynamics, Springer.\",\"DOI\":\"10.1007\\/978-94-007-1344-4\"},{\"key\":\"ref_92\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Denecke, K., Ern\\u00e9, M., and Wismath, S.L. (2004). Galois Connections and Applications, Springer.\",\"DOI\":\"10.1007\\/978-1-4020-1898-5\"},{\"key\":\"ref_93\",\"unstructured\":\"Ganter, B., and Wille, R. (2012). Formal Concept Analysis: Mathematical Foundations, Springer.\"},{\"key\":\"ref_94\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Ganter, B., Obiedkov, S., Rudolph, S., and Stumme, G. (2016). Conceptual Exploration, Springer.\",\"DOI\":\"10.1007\\/978-3-662-49291-8\"},{\"key\":\"ref_95\",\"first-page\":\"131\",\"article-title\":\"Nitpick: A Counterexample Generator for Higher-Order Logic Based on a Relational Model Finder\",\"volume\":\"Volume 6172\",\"author\":\"Kaufmann\",\"year\":\"2010\",\"journal-title\":\"Interactive Theorem Proving, Proceedings of the First International Conference, ITP 2010, Edinburgh, UK, 11\\u201314 July 2010\"},{\"key\":\"ref_96\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"79\",\"DOI\":\"10.1023\\/A:1019501830692\",\"article-title\":\"The missing link revisited: The role of teleology in representing legal argument\",\"volume\":\"10\",\"year\":\"2002\",\"journal-title\":\"Artif. Intell. Law\"},{\"key\":\"ref_97\",\"first-page\":\"208\",\"article-title\":\"Pierson vs. Post revisited\",\"volume\":\"144\",\"author\":\"Gordon\",\"year\":\"2006\",\"journal-title\":\"Front. Artif. Intell. Appl.\"},{\"key\":\"ref_98\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"109\",\"DOI\":\"10.1007\\/s10817-013-9278-5\",\"article-title\":\"Extending Sledgehammer with SMT Solvers\",\"volume\":\"51\",\"author\":\"Blanchette\",\"year\":\"2013\",\"journal-title\":\"J. Autom. Reason.\"},{\"key\":\"ref_99\",\"unstructured\":\"Benzm\\u00fcller, C. (2013, January 3\\u20139). Automating Quantified Conditional Logics in HOL. Proceedings of the 23rd International Joint Conference on Artificial Intelligence (IJCAI-13), Beijing, China.\"},{\"key\":\"ref_100\",\"unstructured\":\"Zalta, E.N. (2017). The Stanford Encyclopedia of Philosophy, Metaphysics Research Lab, Stanford University. [Winter 2017 ed.].\"},{\"key\":\"ref_101\",\"first-page\":\"277\",\"article-title\":\"Isabelle\\/Isar\\u2014A generic framework for human-readable proof documents\",\"volume\":\"10\",\"author\":\"Wenzel\",\"year\":\"2007\",\"journal-title\":\"Insight Proof-Festschr. Honour Andrzej Trybulec\"},{\"key\":\"ref_102\",\"unstructured\":\"Rissland, E.L., and Ashley, K.D. (1997\\u201329, January 27). A case-based system for trade secrets law. Proceedings of the 1st International Conference on Artificial Intelligence and Law, Boston, MA, USA.\"},{\"key\":\"ref_103\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"113\",\"DOI\":\"10.1111\\/j.1467-8640.1995.tb00025.x\",\"article-title\":\"A Logic Of Argumentation for Reasoning under Uncertainty\",\"volume\":\"11\",\"author\":\"Krause\",\"year\":\"1995\",\"journal-title\":\"Comput. Intell.\"},{\"key\":\"ref_104\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"771\",\"DOI\":\"10.1017\\/S1755020321000277\",\"article-title\":\"Logics of Formal Inconsistency Enriched with Replacement: An Algebraic and Modal Account\",\"volume\":\"15\",\"author\":\"Carnielli\",\"year\":\"2021\",\"journal-title\":\"Rev. Symb. Log.\"},{\"key\":\"ref_105\",\"unstructured\":\"Fuenmayor, D. (2023, December 12). Topological Semantics for Paraconsistent and Paracomplete Logics. Archive of Formal Proofs. Available online: https:\\/\\/isa-afp.org\\/entries\\/Topological_Semantics.html.\"},{\"key\":\"ref_106\",\"first-page\":\"251\",\"article-title\":\"Reasonable Machines: A Research Manifesto\",\"volume\":\"Volume 12352\",\"author\":\"Schmid\",\"year\":\"2020\",\"journal-title\":\"KI 2020: Advances in Artificial Intelligence, Proceedings of the 43rd German Conference on Artificial Intelligence, Bamberg, Germany, 21\\u201325 September 2020\"},{\"key\":\"ref_107\",\"first-page\":\"2903\",\"article-title\":\"Normative Reasoning with Expressive Logic Combinations\",\"volume\":\"Volume 325\",\"author\":\"Catala\",\"year\":\"2020\",\"journal-title\":\"ECAI 2020, Proceedings of the 24th European Conference on Artificial Intelligence, Santiago de Compostela, Spain, 8\\u201312 June 2020\"},{\"key\":\"ref_108\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"438\",\"DOI\":\"10.1007\\/978-3-031-38499-8_25\",\"article-title\":\"Theorem Proving in Dependently-Typed Higher-Order Logic\",\"volume\":\"Volume 14132\",\"author\":\"Pientka\",\"year\":\"2023\",\"journal-title\":\"Automated Deduction\\u2014CADE 29, Proceedings of the 29th International Conference on Automated Deduction, Rome, Italy, 1\\u20134 July 2023\"},{\"key\":\"ref_109\",\"unstructured\":\"Zalta, E.N., and Nodelman, U. (2023). The Stanford Encyclopedia of Philosophy, Metaphysics Research Lab, Stanford University. [Fall 2023 ed.].\"},{\"key\":\"ref_110\",\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Benzm\\u00fcller, C., Fuenmayor, D., Steen, A., and Sutcliffe, G. (2023). Who Finds the Short Proof?. Log. J. IGPL.\",\"DOI\":\"10.1093\\/jigpal\\/jzac082\"},{\"key\":\"ref_111\",\"unstructured\":\"H\\u00f6tzendorfer, W., Tschol, C., and Kummer, F. (2020). International Trends in Legal Informatics: A Festschrift for Erich Schweighofer, Weblaw.\"}],\"container-title\":[\"Logics\"],\"language\":\"en\",\"link\":[{\"URL\":\"https:\\/\\/www.mdpi.com\\/2813-0405\\/2\\/1\\/3\\/pdf\",\"content-type\":\"unspecified\",\"content-version\":\"vor\",\"intended-application\":\"similarity-checking\"}],\"deposited\":{\"date-parts\":[[2024,3,14]],\"date-time\":\"2024-03-14T12:01:53Z\",\"timestamp\":1710417713000},\"score\":0.0,\"resource\":{\"primary\":{\"URL\":\"https:\\/\\/www.mdpi.com\\/2813-0405\\/2\\/1\\/3\"}},\"issued\":{\"date-parts\":[[2024,3,14]]},\"references-count\":111,\"journal-issue\":{\"issue\":\"1\",\"published-online\":{\"date-parts\":[[2024,3]]}},\"alternative-id\":[\"logics2010003\"],\"URL\":\"http:\\/\\/dx.doi.org\\/10.3390\\/logics2010003\",\"ISSN\":[\"2813-0405\"],\"issn-type\":[{\"value\":\"2813-0405\",\"type\":\"electronic\"}],\"published\":{\"date-parts\":[[2024,3,14]]}},{\"indexed\":{\"date-parts\":[[2024,9,8]],\"date-time\":\"2024-09-08T09:53:10Z\",\"timestamp\":1725789190905},\"publisher-location\":\"New York, NY, USA\",\"reference-count\":73,\"publisher\":\"ACM\",\"license\":[{\"start\":{\"date-parts\":[[2015,6,28]],\"date-time\":\"2015-06-28T00:00:00Z\",\"timestamp\":1435449600000},\"content-version\":\"vor\",\"delay-in-days\":0,\"URL\":\"http:\\/\\/www.acm.org\\/publications\\/policies\\/copyright_policy#Background\"}],\"content-domain\":{\"domain\":[\"dl.acm.org\"],\"crossmark-restriction\":true},\"published-print\":{\"date-parts\":[[2015,6,28]]},\"DOI\":\"10.1145\\/2786451.2786465\",\"type\":\"proceedings-article\",\"created\":{\"date-parts\":[[2016,6,2]],\"date-time\":\"2016-06-02T12:51:15Z\",\"timestamp\":1464871875000},\"page\":\"1-12\",\"update-policy\":\"http:\\/\\/dx.doi.org\\/10.1145\\/crossmark-policy\",\"source\":\"Crossref\",\"is-referenced-by-count\":18,\"title\":[\"RoboCode-Ethicists\"],\"prefix\":\"10.1145\",\"volume\":\"55\",\"author\":[{\"given\":\"Christoph\",\"family\":\"Lutz\",\"sequence\":\"first\",\"affiliation\":[{\"name\":\"Institute for Media &amp; Communications Management, University of St. Gallen, Blumenbergplatz 9, CH-9000\"}]},{\"given\":\"Aurelia\",\"family\":\"Tam\\u00f2\",\"sequence\":\"additional\",\"affiliation\":[{\"name\":\"Chair for Information and Communication Law, University of Zurich, R\\u00e4mistrasse 74\\/49, CH-8001\"}]}],\"member\":\"320\",\"published-online\":{\"date-parts\":[[2015,6,28]]},\"reference\":[{\"unstructured\":\"Aeschlimann L. Harasgama R. Kehr F. Lutz C. Milanova V. M\\u00fcller S. Strathoff P. and Tam\\u00f2 A. 2015. Re-Setting the Stage for Privacy: A Multi-Layered Privacy Interaction Framework and Its Application. In S. Br\\u00e4ndli R. Harasgama R. Schister and A. Tam\\u00f2 (eds.) Mensch und Maschine -- Symbiose oder Parasitismus St\\u00e4mpfli Berne 1--43.  Aeschlimann L. Harasgama R. Kehr F. Lutz C. Milanova V. M\\u00fcller S. Strathoff P. and Tam\\u00f2 A. 2015. Re-Setting the Stage for Privacy: A Multi-Layered Privacy Interaction Framework and Its Application. In S. Br\\u00e4ndli R. Harasgama R. Schister and A. Tam\\u00f2 (eds.) Mensch und Maschine -- Symbiose oder Parasitismus St\\u00e4mpfli Berne 1--43.\",\"key\":\"e_1_3_2_1_1_1\"},{\"volume-title\":\"Moral Machines: Contradiction in Terms or Abdication of Human Responsibility? In P\",\"year\":\"2012\",\"author\":\"Allen C.\",\"key\":\"e_1_3_2_1_2_1\"},{\"volume-title\":\"Machine Ethics\",\"author\":\"Anderson S. L.\",\"doi-asserted-by\":\"crossref\",\"key\":\"e_1_3_2_1_3_1\",\"DOI\":\"10.1017\\/CBO9780511978036\"},{\"volume-title\":\"Machine Ethics\",\"author\":\"Anderson S. L.\",\"doi-asserted-by\":\"crossref\",\"key\":\"e_1_3_2_1_4_1\",\"DOI\":\"10.1017\\/CBO9780511978036\"},{\"volume-title\":\"Coding Regulation: Essays on the Normative Role of Information Technology\",\"author\":\"Asscher L.\",\"key\":\"e_1_3_2_1_5_1\"},{\"volume-title\":\"Robot Ethics: The Ethical and Social Implications of Robotics\",\"author\":\"Bekey G.\",\"key\":\"e_1_3_2_1_6_1\"},{\"volume-title\":\"D\",\"year\":\"2006\",\"author\":\"Bennet C. J.\",\"key\":\"e_1_3_2_1_7_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_8_1\",\"DOI\":\"10.1080\\/1369118X.2012.678878\"},{\"volume-title\":\"The Cambridge Handbook of Information and Computer Ethics\",\"author\":\"Brey P.\",\"key\":\"e_1_3_2_1_9_1\"},{\"volume-title\":\"Robot Caregivers: Ethical Issues across the Human Lifespan\",\"year\":\"2012\",\"author\":\"Borenstein J.\",\"key\":\"e_1_3_2_1_10_1\"},{\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Brownsword R. 2008. Rights Regulation and the Technological Revolution. Oxford University Press Oxford (UK).   Brownsword R. 2008. Rights Regulation and the Technological Revolution. Oxford University Press Oxford (UK).\",\"key\":\"e_1_3_2_1_11_1\",\"DOI\":\"10.1093\\/acprof:oso\\/9780199276806.001.0001\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_12_1\",\"DOI\":\"10.1093\\/acprof:oso\\/9780199675555.001.0001\"},{\"volume-title\":\"Robot Ethics: The Ethical and Social Implications of Robotics\",\"author\":\"Calo R.\",\"key\":\"e_1_3_2_1_13_1\"},{\"unstructured\":\"Calo R. 2014. Robotics and the New Cyberlaw. SSRN Electronic Journal 101--146. Online: http:\\/\\/robots.law.miami.edu\\/2014\\/wp-content\\/uploads\\/2013\\/06\\/Calo-Robotics-and-the-New-Cyberlaw.pdf  Calo R. 2014. Robotics and the New Cyberlaw. SSRN Electronic Journal 101--146. Online: http:\\/\\/robots.law.miami.edu\\/2014\\/wp-content\\/uploads\\/2013\\/06\\/Calo-Robotics-and-the-New-Cyberlaw.pdf\",\"key\":\"e_1_3_2_1_14_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_15_1\",\"DOI\":\"10.1093\\/idpl\\/ipt005\"},{\"unstructured\":\"Cavoukian A. 2009. Privacy by Design -- The 7 Foundational Principles. Information and Privacy Commissioner of Ontario. Online: https:\\/\\/www.iab.org\\/wp-content\\/IAB-uploads\\/2011\\/03\\/fred_carter.pdf  Cavoukian A. 2009. Privacy by Design -- The 7 Foundational Principles. Information and Privacy Commissioner of Ontario. Online: https:\\/\\/www.iab.org\\/wp-content\\/IAB-uploads\\/2011\\/03\\/fred_carter.pdf\",\"key\":\"e_1_3_2_1_16_1\"},{\"volume-title\":\"Machine Ethics\",\"author\":\"Clarke R.\",\"key\":\"e_1_3_2_1_17_1\"},{\"key\":\"e_1_3_2_1_18_1\",\"first-page\":\"93\",\"article-title\":\"Big Data and Due Process: Toward a Framework to Redress Predictive Privacy Harms\",\"volume\":\"55\",\"author\":\"Crawford K.\",\"year\":\"2014\",\"journal-title\":\"Boston College Law Review\"},{\"unstructured\":\"Darling K. 2012. Extending Legal Rights to Social Robots. SSRN Online Journal 1--18. Online: http:\\/\\/papers.ssrn.com\\/sol3\\/papers.cfm?abstract_id=2044797  Darling K. 2012. Extending Legal Rights to Social Robots. SSRN Online Journal 1--18. Online: http:\\/\\/papers.ssrn.com\\/sol3\\/papers.cfm?abstract_id=2044797\",\"key\":\"e_1_3_2_1_19_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_20_1\",\"DOI\":\"10.1016\\/j.chb.2014.10.030\"},{\"volume-title\":\"Rethinking Prototyping: Proceedings of the Design Modelling Symposium Berlin\",\"year\":\"2013\",\"author\":\"Del Campo M.\",\"key\":\"e_1_3_2_1_21_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_22_1\",\"DOI\":\"10.1145\\/1620545.1620564\"},{\"key\":\"e_1_3_2_1_23_1\",\"first-page\":\"2014\",\"article-title\":\"Why it is not possible to regulate robots here\",\"volume\":\"2\",\"author\":\"Doctorow C.\",\"year\":\"2014\",\"journal-title\":\"The Guardian Technology Blog, Robots\"},{\"volume-title\":\"Attitudes on Data Protection and Electronic Identity in the European Union. Research Report. Online: http:\\/\\/ec.europa.eu\\/public_opinion\\/archives\\/ebs\\/ebs_359_en.pdf\",\"year\":\"2011\",\"author\":\"Eurobarometer\",\"key\":\"e_1_3_2_1_24_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_25_1\",\"DOI\":\"10.1023\\/A:1010018611096\"},{\"volume-title\":\"The Cambridge Handbook of Information and Computer Ethics\",\"author\":\"Floridi L.\",\"doi-asserted-by\":\"crossref\",\"key\":\"e_1_3_2_1_26_1\",\"DOI\":\"10.1017\\/CBO9780511845239\"},{\"volume-title\":\"The Ethics of Systems Design\",\"author\":\"Friedman B.\",\"key\":\"e_1_3_2_1_27_1\"},{\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Friedman B. and Kahn P. 2008. Human Values Ethics and Design. In J. Jacko and A. Sears (eds.) The Human Computer Interaction Handbook (2nd edition) Lawrence Erlbaum Associates Mahwah (NJ) 1241--1266  Friedman B. and Kahn P. 2008. Human Values Ethics and Design. In J. Jacko and A. Sears (eds.) The Human Computer Interaction Handbook (2nd edition) Lawrence Erlbaum Associates Mahwah (NJ) 1241--1266\",\"key\":\"e_1_3_2_1_28_1\",\"DOI\":\"10.1201\\/9781410615862.ch63\"},{\"unstructured\":\"Friedman B. Kahn. P. H. and Borning A. 2002. Value sensitive design: Theory and methods. University of Washington technical report 02-12. Online: http:\\/\\/www.urbansim.org\\/pub\\/Research\\/ResearchPapers\\/vsd-theory-methods-tr.pdf  Friedman B. Kahn. P. H. and Borning A. 2002. Value sensitive design: Theory and methods. University of Washington technical report 02-12. Online: http:\\/\\/www.urbansim.org\\/pub\\/Research\\/ResearchPapers\\/vsd-theory-methods-tr.pdf\",\"key\":\"e_1_3_2_1_29_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_30_1\",\"DOI\":\"10.1145\\/1349822.1349842\"},{\"unstructured\":\"Fukuoka World Robot Declaration 2004. Online: http:\\/\\/www.prnewswire.co.uk\\/news-releases\\/world-robot-declaration-from-international-robot-fair-2004-organizing-office-154289895.html  Fukuoka World Robot Declaration 2004. Online: http:\\/\\/www.prnewswire.co.uk\\/news-releases\\/world-robot-declaration-from-international-robot-fair-2004-organizing-office-154289895.html\",\"key\":\"e_1_3_2_1_31_1\"},{\"volume-title\":\"M. D. Ermann and M. S. Shauf (eds). Computers, Ethics, and Society\",\"author\":\"Garfinkel S.\",\"key\":\"e_1_3_2_1_32_1\"},{\"volume-title\":\"Machine Ethics\",\"author\":\"Gips J.\",\"key\":\"e_1_3_2_1_33_1\"},{\"key\":\"e_1_3_2_1_34_1\",\"first-page\":\"1\",\"article-title\":\"Diversity by Choice: Applying a Social Cognitive Perspective to the Role of Public Service Media in the Digital Age\",\"volume\":\"9\",\"author\":\"Hoffmann C. P.\",\"year\":\"2015\",\"journal-title\":\"International Journal of Communication\"},{\"volume-title\":\"The Best Action Is One with the Best Consequences\",\"author\":\"Hospers J.\",\"key\":\"e_1_3_2_1_35_1\"},{\"unstructured\":\"International Federation of Robotics 2013. World Robotics 2013 Report.  International Federation of Robotics 2013. World Robotics 2013 Report.\",\"key\":\"e_1_3_2_1_36_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_37_1\",\"DOI\":\"10.1177\\/016224390202700102\"},{\"volume-title\":\"Personal Privacy in Ubiquitous Computing: Tools and System Support. Dissertation submitted to the Swiss Federal Institute of Technology Zurich\",\"year\":\"2005\",\"author\":\"Langheinrich M.\",\"key\":\"e_1_3_2_1_38_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_39_1\",\"DOI\":\"10.1007\\/s00779-004-0304-9\"},{\"volume-title\":\"Code and Other Laws of Cyberspace\",\"author\":\"Lessig L.\",\"key\":\"e_1_3_2_1_40_1\"},{\"volume-title\":\"Code version 2.0\",\"author\":\"Lessig L.\",\"key\":\"e_1_3_2_1_41_1\"},{\"volume-title\":\"Robot Ethics: The Ethical and Social Implications of Robotics\",\"author\":\"Lin P.\",\"key\":\"e_1_3_2_1_42_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_43_1\",\"DOI\":\"10.1016\\/j.artint.2010.11.026\"},{\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Lutz C. and Strathoff P. 2013. Privacy Concerns and Online Behavior -- Not so Paradoxical After All? Viewing the Privacy Paradox through Different Theoretical Lenses. In S. Br\\u00e4ndli R. Schister and A. Tam\\u00f2 (eds.) Multinationale Unternehmen und Institutionen im Wandel -- Herausforderungen f\\u00fcr Wirtschaft Recht und Gesellschaft St\\u00e4mpfli Berne 81--99.  Lutz C. and Strathoff P. 2013. Privacy Concerns and Online Behavior -- Not so Paradoxical After All? Viewing the Privacy Paradox through Different Theoretical Lenses. In S. Br\\u00e4ndli R. Schister and A. Tam\\u00f2 (eds.) Multinationale Unternehmen und Institutionen im Wandel -- Herausforderungen f\\u00fcr Wirtschaft Recht und Gesellschaft St\\u00e4mpfli Berne 81--99.\",\"key\":\"e_1_3_2_1_44_1\",\"DOI\":\"10.2139\\/ssrn.2425132\"},{\"unstructured\":\"MacKenzie D. and Wajcman J. 1999. The Social Shaping of Technology Open University Press Buckingham (UK).  MacKenzie D. and Wajcman J. 1999. The Social Shaping of Technology Open University Press Buckingham (UK).\",\"key\":\"e_1_3_2_1_45_1\"},{\"volume-title\":\"Privacy Online -- Perspectives on Privacy and Self-Disclosure in the Social Web\",\"author\":\"Margulis S. T.\",\"key\":\"e_1_3_2_1_46_1\"},{\"volume-title\":\"Big Data: A Revolution That Will Transform How We Live, Work and Think\",\"year\":\"2013\",\"author\":\"Mayer-Sch\\u00f6nberger V.\",\"key\":\"e_1_3_2_1_47_1\"},{\"volume-title\":\"Machine Ethics\",\"author\":\"Moor J. H.\",\"key\":\"e_1_3_2_1_48_1\"},{\"key\":\"e_1_3_2_1_49_1\",\"first-page\":\"101\",\"article-title\":\"Privacy as Contextual Integrity\",\"volume\":\"79\",\"author\":\"Nissenbaum H.\",\"year\":\"2004\",\"journal-title\":\"Washington Las Review\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_50_1\",\"DOI\":\"10.1080\\/0952813X.2014.895111\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_51_1\",\"DOI\":\"10.1162\\/desi.2009.25.4.91\"},{\"unstructured\":\"PEW Research 2014. Internet of things Report. Online: http:\\/\\/www.pewinternet.org\\/files\\/2014\\/05\\/PIP_Internet-of-things_0514142.pdf  PEW Research 2014. Internet of things Report. Online: http:\\/\\/www.pewinternet.org\\/files\\/2014\\/05\\/PIP_Internet-of-things_0514142.pdf\",\"key\":\"e_1_3_2_1_52_1\"},{\"unstructured\":\"PEW Research 2014. AI Robotics and the Future of Jobs. Online: http:\\/\\/www.pewinternet.org\\/files\\/2014\\/08\\/Future-of-AI-Robotics-and-Jobs.pdf  PEW Research 2014. AI Robotics and the Future of Jobs. Online: http:\\/\\/www.pewinternet.org\\/files\\/2014\\/08\\/Future-of-AI-Robotics-and-Jobs.pdf\",\"key\":\"e_1_3_2_1_53_1\"},{\"unstructured\":\"PEW Research 2014. Public Perceptions of Privacy and Security in the Post-Snowden Era. Online: http:\\/\\/www.pewinternet.org\\/files\\/2014\\/11\\/PI_PublicPerceptionsofPrivacy_111214.pdf  PEW Research 2014. Public Perceptions of Privacy and Security in the Post-Snowden Era. Online: http:\\/\\/www.pewinternet.org\\/files\\/2014\\/11\\/PI_PublicPerceptionsofPrivacy_111214.pdf\",\"key\":\"e_1_3_2_1_54_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_55_1\",\"DOI\":\"10.1177\\/030631284014003004\"},{\"doi-asserted-by\":\"crossref\",\"unstructured\":\"Pfleeger C. P. and Pfleeger S. H. 2007. Security in Computing (4th edition). Prentice Hall New York (NY).   Pfleeger C. P. and Pfleeger S. H. 2007. Security in Computing (4th edition). Prentice Hall New York (NY).\",\"key\":\"e_1_3_2_1_56_1\",\"DOI\":\"10.1109\\/MSP.2006.111\"},{\"key\":\"e_1_3_2_1_57_1\",\"first-page\":\"554\",\"article-title\":\"Lex Informatica: The Formulation of Information Policy Rules Through Technology\",\"volume\":\"76\",\"author\":\"Reidenberg J.R.\",\"year\":\"1998\",\"journal-title\":\"Texas Law Review\"},{\"volume-title\":\"We Robot Conference\",\"year\":\"2014\",\"author\":\"Riek L. D.\",\"key\":\"e_1_3_2_1_58_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_59_1\",\"DOI\":\"10.1016\\/j.chb.2014.03.066\"},{\"volume-title\":\"Robot Ethics: The Ethical and Social Implications of Robotics\",\"author\":\"Scheutz M.\",\"key\":\"e_1_3_2_1_60_1\"},{\"volume-title\":\"Workshop on Roboethics at the 2007 IEEE International Conference on Robotics and Automation (IRCA)\",\"year\":\"2007\",\"author\":\"Scheutz M.\",\"key\":\"e_1_3_2_1_61_1\"},{\"volume-title\":\"Wired for War\",\"author\":\"Singer P.\",\"key\":\"e_1_3_2_1_62_1\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_63_1\",\"DOI\":\"10.5555\\/2208940.2208950\"},{\"volume-title\":\"Harvard University Press\",\"author\":\"Solove D. J.\",\"key\":\"e_1_3_2_1_64_1\"},{\"key\":\"e_1_3_2_1_65_1\",\"first-page\":\"1880\",\"article-title\":\"Introduction: Privacy Self-Management and the Consent Dilemma\",\"volume\":\"126\",\"author\":\"Solove D. J.\",\"year\":\"2012\",\"journal-title\":\"Harvard Law Review\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_66_1\",\"DOI\":\"10.1177\\/0270467607311484\"},{\"volume-title\":\"Machine Ethics\",\"author\":\"Turkle S.\",\"key\":\"e_1_3_2_1_67_1\"},{\"volume-title\":\"Privacy Technologies and Policy\",\"author\":\"Van Rest J.\",\"key\":\"e_1_3_2_1_68_1\"},{\"unstructured\":\"Veruggio G. 2007. EURON Robotics Roadmap. Online: http:\\/\\/www.roboethics.org\\/index_file\\/Roboethics%20Roadmap%20Rel.1.2.pdf  Veruggio G. 2007. EURON Robotics Roadmap. Online: http:\\/\\/www.roboethics.org\\/index_file\\/Roboethics%20Roadmap%20Rel.1.2.pdf\",\"key\":\"e_1_3_2_1_69_1\"},{\"volume-title\":\"Harvard Business Review\",\"year\":\"2014\",\"author\":\"Watson S.\",\"key\":\"e_1_3_2_1_70_1\"},{\"volume-title\":\"Economy and Society\",\"author\":\"Weber M.\",\"doi-asserted-by\":\"crossref\",\"key\":\"e_1_3_2_1_71_1\",\"DOI\":\"10.4159\\/9780674240827\"},{\"doi-asserted-by\":\"publisher\",\"key\":\"e_1_3_2_1_72_1\",\"DOI\":\"10.1109\\/MPRV.2002.993141\"},{\"volume-title\":\"Autonomous Technology: Technics-out-of-Control as a Theme in Political Thought\",\"year\":\"1977\",\"author\":\"Winner L.\",\"key\":\"e_1_3_2_1_73_1\"}],\"event\":{\"sponsor\":[\"SIGWEB ACM Special Interest Group on Hypertext, Hypermedia, and Web\"],\"acronym\":\"WebSci '15\",\"name\":\"WebSci '15: ACM Web Science Conference\",\"location\":\"Oxford United Kingdom\"},\"container-title\":[\"Proceedings of the ACM Web Science Conference\"],\"link\":[{\"URL\":\"https:\\/\\/dl.acm.org\\/doi\\/pdf\\/10.1145\\/2786451.2786465\",\"content-type\":\"unspecified\",\"content-version\":\"vor\",\"intended-application\":\"similarity-checking\"}],\"deposited\":{\"date-parts\":[[2023,1,9]],\"date-time\":\"2023-01-09T00:11:55Z\",\"timestamp\":1673223115000},\"score\":0.0,\"resource\":{\"primary\":{\"URL\":\"https:\\/\\/dl.acm.org\\/doi\\/10.1145\\/2786451.2786465\"}},\"subtitle\":[\"Privacy-friendly robots, an ethical responsibility of engineers?\"],\"issued\":{\"date-parts\":[[2015,6,28]]},\"references-count\":73,\"alternative-id\":[\"10.1145\\/2786451.2786465\",\"10.1145\\/2786451\"],\"URL\":\"http:\\/\\/dx.doi.org\\/10.1145\\/2786451.2786465\",\"published\":{\"date-parts\":[[2015,6,28]]},\"assertion\":[{\"value\":\"2015-06-28\",\"order\":2,\"name\":\"published\",\"label\":\"Published\",\"group\":{\"name\":\"publication_history\",\"label\":\"Publication History\"}}]},{\"indexed\":{\"date-parts\":[[2024,10,6]],\"date-time\":\"2024-10-06T00:36:00Z\",\"timestamp\":1728174960641},\"reference-count\":10,\"publisher\":\"Oxford University Press (OUP)\",\"issue\":\"236\",\"content-domain\":{\"domain\":[],\"crossmark-restriction\":false},\"published-print\":{\"date-parts\":[[1950,10,1]]},\"DOI\":\"10.1093\\/mind\\/lix.236.433\",\"type\":\"journal-article\",\"created\":{\"date-parts\":[[2007,1,3]],\"date-time\":\"2007-01-03T04:04:28Z\",\"timestamp\":1167797068000},\"page\":\"433-460\",\"source\":\"Crossref\",\"is-referenced-by-count\":6304,\"title\":[\"I.\\u2014COMPUTING MACHINERY AND INTELLIGENCE\"],\"prefix\":\"10.1093\",\"volume\":\"LIX\",\"author\":[{\"given\":\"A. M.\",\"family\":\"TURING\",\"sequence\":\"first\",\"affiliation\":[]}],\"member\":\"286\",\"published-online\":{\"date-parts\":[[1950,10,1]]},\"reference\":[{\"key\":\"2019100908383620400_R1\",\"article-title\":\"Chapters 23, 24, 25\",\"volume-title\":\"The Book of the Machines\",\"author\":\"Samuel\",\"year\":\"1865\"},{\"key\":\"2019100908383620400_R2\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"345\",\"DOI\":\"10.2307\\/2371045\",\"article-title\":\"An Unsolvable Problem of Elementary Number Theory\",\"volume\":\"58\",\"author\":\"Alonzo\",\"year\":\"1936\",\"journal-title\":\"American J. of Math.\"},{\"key\":\"2019100908383620400_R3\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"173\",\"DOI\":\"10.1007\\/BF01700692\",\"article-title\":\"\\u00dcber formal unentscheildbare S\\u00e4tze der Principia Mathematica und verwandter Systeme, I\",\"author\":\"G\\u00f6del\",\"year\":\"1931\",\"journal-title\":\"Monatshefle f\\u00fcr Math, und Phys.\"},{\"key\":\"2019100908383620400_R4\",\"author\":\"Hartree\",\"year\":\"1949\",\"journal-title\":\"Calculating Instruments and Machines\"},{\"key\":\"2019100908383620400_R5\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"153\",\"DOI\":\"10.2307\\/2372027\",\"article-title\":\"General Recursive Functions of Natural Numbers\",\"volume\":\"57\",\"author\":\"Kleene\",\"year\":\"1935\",\"journal-title\":\"American J. of Math.\"},{\"key\":\"2019100908383620400_R6\",\"doi-asserted-by\":\"crossref\",\"first-page\":\"1105\",\"DOI\":\"10.1136\\/bmj.1.4616.1105\",\"article-title\":\"The Mind of Mechanical Man\\u201d. Lister Oration for 1949\",\"volume\":\"i\",\"author\":\"Jefferson\",\"year\":\"1949\",\"journal-title\":\"British Medical Journal\"},{\"key\":\"2019100908383620400_R7\",\"first-page\":\"691\",\"article-title\":\"Translator's notes to an article on Babbage's Analytical Engiro\",\"volume\":\"3\",\"author\":\"Countess of Lovelace\",\"year\":\"1842\",\"journal-title\":\"Scientific Memoirs\"},{\"key\":\"2019100908383620400_R8\",\"volume-title\":\"History of Western Philosophy\",\"author\":\"Bertrand\",\"year\":\"1940\"},{\"key\":\"2019100908383620400_R9\",\"first-page\":\"230\",\"article-title\":\"On Computable Numbers, with an Application to the Entscheidungsproblem\",\"volume-title\":\"Proc. London Math. Soc.\",\"author\":\"Turing\",\"year\":\"1937\"},{\"key\":\"2019100908383620400_R10\",\"volume-title\":\"Victoria University of Manchester.\"}],\"container-title\":[\"Mind\"],\"language\":\"en\",\"link\":[{\"URL\":\"http:\\/\\/academic.oup.com\\/mind\\/article-pdf\\/LIX\\/236\\/433\\/30123314\\/lix-236-433.pdf\",\"content-type\":\"application\\/pdf\",\"content-version\":\"vor\",\"intended-application\":\"syndication\"},{\"URL\":\"http:\\/\\/academic.oup.com\\/mind\\/article-pdf\\/LIX\\/236\\/433\\/30123314\\/lix-236-433.pdf\",\"content-type\":\"unspecified\",\"content-version\":\"vor\",\"intended-application\":\"similarity-checking\"}],\"deposited\":{\"date-parts\":[[2019,10,9]],\"date-time\":\"2019-10-09T12:38:43Z\",\"timestamp\":1570624723000},\"score\":0.0,\"resource\":{\"primary\":{\"URL\":\"https:\\/\\/academic.oup.com\\/mind\\/article\\/LIX\\/236\\/433\\/986238\"}},\"issued\":{\"date-parts\":[[1950,10,1]]},\"references-count\":10,\"journal-issue\":{\"issue\":\"236\",\"published-online\":{\"date-parts\":[[1950,10,1]]},\"published-print\":{\"date-parts\":[[1950,10,1]]}},\"URL\":\"http:\\/\\/dx.doi.org\\/10.1093\\/mind\\/lix.236.433\",\"ISSN\":[\"1460-2113\",\"0026-4423\"],\"issn-type\":[{\"value\":\"1460-2113\",\"type\":\"electronic\"},{\"value\":\"0026-4423\",\"type\":\"print\"}],\"published-other\":{\"date-parts\":[[1950,10]]},\"published\":{\"date-parts\":[[1950,10,1]]}}],\"items-per-page\":20,\"query\":{\"start-index\":0,\"search-terms\":null}}}",
		"items": [
			{
				"itemType": "journalArticle",
				"title": "Modelling Value-Oriented Legal Reasoning in LogiKEy",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Christoph",
						"lastName": "Benzmüller"
					},
					{
						"creatorType": "author",
						"firstName": "David",
						"lastName": "Fuenmayor"
					},
					{
						"creatorType": "author",
						"firstName": "Bertram",
						"lastName": "Lomfeld"
					}
				],
				"date": "2024-03-14",
				"DOI": "10.3390/logics2010003",
				"ISSN": "2813-0405",
				"abstractNote": "The logico-pluralist LogiKEy knowledge engineering methodology and framework is applied to the modelling of a theory of legal balancing, in which legal knowledge (cases and laws) is encoded by utilising context-dependent value preferences. The theory obtained is then used to formalise, automatically evaluate, and reconstruct illustrative property law cases (involving the appropriation of wild animals) within the Isabelle/HOL proof assistant system, illustrating how LogiKEy can harness interactive and automated theorem-proving technology to provide a testbed for the development and formal verification of legal domain-specific languages and theories. Modelling value-oriented legal reasoning in that framework, we establish novel bridges between the latest research in knowledge representation and reasoning in non-classical logics, automated theorem proving, and applications in legal reasoning.",
				"issue": "1",
				"language": "en",
				"libraryCatalog": "Crossref",
				"pages": "31-78",
				"publicationTitle": "Logics",
				"rights": "https://creativecommons.org/licenses/by/4.0/",
				"url": "https://www.mdpi.com/2813-0405/2/1/3",
				"volume": "2",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			},
			{
				"itemType": "conferencePaper",
				"title": "RoboCode-Ethicists: Privacy-friendly robots, an ethical responsibility of engineers?",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "Christoph",
						"lastName": "Lutz"
					},
					{
						"creatorType": "author",
						"firstName": "Aurelia",
						"lastName": "Tamò"
					}
				],
				"date": "2015-06-28",
				"DOI": "10.1145/2786451.2786465",
				"conferenceName": "WebSci '15: ACM Web Science Conference",
				"libraryCatalog": "Crossref",
				"pages": "1-12",
				"place": "Oxford United Kingdom",
				"proceedingsTitle": "Proceedings of the ACM Web Science Conference",
				"publisher": "ACM",
				"rights": "http://www.acm.org/publications/policies/copyright_policy#Background",
				"url": "https://dl.acm.org/doi/10.1145/2786451.2786465",
				"volume": "55",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			},
			{
				"itemType": "journalArticle",
				"title": "I.—COMPUTING MACHINERY AND INTELLIGENCE",
				"creators": [
					{
						"creatorType": "author",
						"firstName": "A. M.",
						"lastName": "Turing"
					}
				],
				"date": "1950-10-01",
				"DOI": "10.1093/mind/lix.236.433",
				"ISSN": "1460-2113, 0026-4423",
				"issue": "236",
				"language": "en",
				"libraryCatalog": "Crossref",
				"pages": "433-460",
				"publicationTitle": "Mind",
				"url": "https://academic.oup.com/mind/article/LIX/236/433/986238",
				"volume": "LIX",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	}
]
/** END TEST CASES **/
