{
	"translatorID": "fb15ed4a-7f58-440e-95ac-61e10aa2b4d8",
	"label": "Wikidata API",
	"creator": "Diego de la Hera",
	"target": "",
	"minVersion": "4.0.29.11",
	"maxVersion": "",
	"priority": 100,
	"inRepository": false,
	"translatorType": 8,
	"lastUpdated": "2021-01-12 23:00:00"
}

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

function cleanQID(qid) {
	return qid;
}

function getQIDs(extra) {
	const qids = //
	return qids.map(qid => cleanQID(qid));
}

// return an array of QIDs from the query (items or text)
function filterQuery(items) {
	if (!items) return [];

	if (typeof items == 'string' || !items.length) items = [items];

	// filter out invalid queries
	const qids = [];
	for (const item of items) {
		let qid;
		if (item.extra && (qid = getQIDs(item.extra)[0])) {
			qids.push(qid);
		}
		else if (typeof item == 'string' && (qid = cleanQID(item))) {
			qids.push(qid);
		}
	}
	return { qids, dois };
}

function doSearch(items) {
	const { qids, dois } = filterQuery(items);
	if (dois.length) {
		dois = dois.map(doi => `"${doi}"`).join(' ');
		const sparql = `SELECT ?item WHERE { VALUES ?doi { ${dois} }. ?item wdt:P356 ?doi. }`;
		const url = `https://query.wikidata.org/sparql?query=${sparql}&format=json`;
		ZU.doGet(url, data => {
			qids.push(...data.results.bindings.map(
				binding => binding.item.value.split('/').slice(-1)[0]
			));
			processQIDs(qids);
		});
	} else {
		processQIDs(qids);
	}
}

function processQIDs(qids) {
	const json = {
		entities = {}
	};
	const urls = getEntitiesURLs(qids);
	ZU.doGet(
		urls,
		(data) => {
			data = JSON.parse(data);
			if (data.entities) {
				Object.assing(json.entities, data.entities)
			}
		},
		() => processJSON(json)
	);
}

function processJSON(json) {
	const trans = Zotero.loadTranslator('import');
	trans.setString(JSON.stringify(json));
	trans.setTranslator('3599d5a3-75c7-4fd5-b8e7-4976ce464e55');  // Wikidata JSON
	trans.setHandler('itemDone', function (obj, item) {
		item.libraryCatalog = "Wikidata API";
		item.complete();
	});
	trans.translate();
}