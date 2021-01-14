/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2021 Diego de la Hera

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with this program. If not, see <http://www.gnu.org/licenses/>.

	***** END LICENSE BLOCK *****
*/

function detectSearch(items) {
	return (filterQuery(items).length > 0);
}

// based on Zotero.Utilities.cleanDOI
function cleanQID(x) {
	if(typeof x != "string") {
		throw new Error("cleanQID: argument must be a string");
	}

	var qid = x.match(/Q[0-9]+/);
	return qid ? qid[0] : null;
}

/**
 * Get QIDs from item's extra field
 */
function getQIDs(extra) {
	const qids = [];
	const re = /^qid:(.+)$/gmi
	let match;
	while ((match = re.exec(extra)) !== null) {
		qids.push(cleanQID(match[1]));
	}
	return qids;
}

// return arrays of QIDs and DOIs from the query (items or text)
function filterQuery(items) {
	const qids = [];
	const dois = [];

	if (items) {
		if (typeof items == 'string' || !items.length) items = [items];

		// filter out invalid queries
		for (const item of items) {
			let qid;
			let doi;
			if (item.extra && (qid = getQIDs(item.extra)[0])) {
				qids.push(qid);
			}
			else if (item.DOI && (doi = ZU.cleanDOI(item.DOI))) {
				dois.push(doi);
			}
			else if (typeof item == 'string') {
				if (qid = cleanQID(item)) {
					qids.push(qid);
				}
				else if (doi = ZU.cleanDOI(item)) {
					dois.push(doi);
				}
			}
		}
	}
	return { qids, dois };
}

function doSearch(items) {
	let { qids, dois } = filterQuery(items);
	if (dois.length) {
		dois = dois.map((doi) => `"${doi}"`).join(' ');
		const sparql = `SELECT ?item WHERE { VALUES ?doi { ${dois} }. ?item wdt:P356 ?doi. }`;
		const url = `https://query.wikidata.org/sparql?query=${sparql}&format=json`;
		ZU.doGet(url, (data) => {
			data = JSON.parse(data);
			qids.push(...data.results.bindings.map(
				(binding) => binding.item.value.split('/').slice(-1)[0]
			));
			processQIDs(qids);
		});
	} else {
		processQIDs(qids);
	}
}

function getManyEntitiesUrls({
	ids,
	languages=[],
	props=[],
	format='json',
	languagefallback=true
}) {
	const baseUrl = 'https://www.wikidata.org/w/api.php?';

	if (!Array.isArray(ids)) ids = [ids];
	if (!Array.isArray(languages)) languages = [languages];
	if (!Array.isArray(props)) props = [props];

	ids = [...new Set(ids)];

	const params = [];
	params.push('action=wbgetentities');
	if (languages) params.push('languages=' + languages);
	if (props) params.push('props=' + props);
	params.push('format=' + format);
	if (languagefallback) params.push('languagefallback');
	params.push('origin=*');

	const urls = [];
	while (ids.length > 0) {
		let idSubset = ids.splice(0, 50);
		idSubset = idSubset.join('|');
		const url = baseUrl + [`ids=${idSubset}`, ...params].join('&');
		urls.push(url);
	}
	return urls;
}

function processQIDs(qids) {
	if (!qids.length) return;

	const json = {
		entities: {}
	};
	const urls = getManyEntitiesUrls({
		ids: qids,
		props: ['claims']
	});
	ZU.doGet(
		urls,
		(data) => {
			data = JSON.parse(data);
			if (data.entities) {
				Object.assign(json.entities, data.entities)
			}
		},
		() => processJSON(json)
	);
}

function processJSON(json) {
	const trans = Zotero.loadTranslator('import');
	trans.setString(JSON.stringify(json));
	trans.setTranslator('3599d5a3-75c7-4fd5-b8e7-4976ce464e55');  // Wikidata JSON
	// trans.setTranslator(new Zotero.Translator({
	// 	code: Zotero.File.getContentsFromURL('chrome://wikicite/content/translators/Wikidata JSON.js'),
	// 	...JSON.parse(Zotero.File.getContentsFromURL('chrome://wikicite/content/translators/Wikidata JSON.json'))
	// }))
	trans.setHandler('itemDone', function (obj, item) {
		item.libraryCatalog = "Wikidata API";
		item.complete();
	});
	trans.translate();
}
