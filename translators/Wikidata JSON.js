/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2021 Diego de la Hera
	Copyright © 2017 Philipp Zumstein

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

// Fixme: append these upon translator installation, as done by BBT plugin
const LOCALE = 'en';
const INSTANCE_OF = 'P31';
const TITLE = 'P1476';
const SERIES_ORDINAL = 'P1545';

//see also https://github.com/UB-Mannheim/zotkat/blob/master/Wikidata%20QuickStatements.js
var typeMapping = {
	"Q838948": "artwork",
	"Q30070318": "audioRecording",
	"Q686822": "bill",
	"Q17928402": "blogPost",
	"Q571": "book",
	"Q3331189": "book", // Edition
	"Q47461344": "book", // written work
	"Q1980247": "bookSection",
	"Q2334719": "case",
	"Q40056": "computerProgram",
	"Q23927052": "conferencePaper",
	"Q30070414": "dictionaryEntry",
	"Q49848": "document",
	"Q30070439": "email",
	"Q17329259": "encyclopediaArticle",
	"Q11424": "film",
	"Q7216866": "forumPost",
	"Q30070550": "hearing",
	"Q30070565": "instantMessage",
	"Q178651": "interview",
	"Q13442814": "journalArticle",
	"Q133492": "letter",
	"Q30070590": "magazineArticle",
	"Q87167": "manuscript",
	"Q4006": "map",
	"Q5707594": "newspaperArticle",
	"Q253623": "patent",
	"Q24634210": "podcast",
	"Q604733": "presentation",
	"Q1555508": "radioBroadcast",
	"Q10870555": "report",
	"Q820655": "statute",
	"Q1266946": "thesis",
	"Q15416": "tvBroadcast",
	"Q30070675": "videoRecording",
	"Q36774": "webpage"
};

//see also https://www.wikidata.org/wiki/Template:Bibliographical_properties
var mapping = {
	'P1476': 'title',
	'P1680': 'subtitle',
	'P123': 'publisher',
	'P577': 'date',
	'P356': 'DOI',
	'P407': 'language',
	'P1433': 'publicationTitle',
	'P921': 'tagString',
	'P50': 'creator',
	'P2093': 'creator',
	'P98': 'creator',
	'P655': 'creator',
	'P110': 'creator',
	'P57': 'creator',
	'P58': 'creator',
	'P161': 'creator',
	'P162': 'creator',
	'P953': 'url',
	'P478': 'volume',
	'P433': 'issue',
	'P304': 'pages',
	'P179': 'series',
	'P212': 'ISBN',
	'P957': 'ISBN',
	'P236': 'ISSN',
	'P136': 'genre',
	'P275': 'rights',
	'P2047': 'runningTime',
	'P750': 'distributor'
};

//creators with no special role here are treated as contributor
var creatorMapping = {
	'P50': 'author',
	'P2093': 'author',
	'P98': 'editor',
	'P655': 'translator',
	'P110': 'illustrator',
	'P57': 'director',
	'P58': 'scriptwriter',
	'P162': 'producer'
};

// copied from CSL JSON
function parseInput() {
	var str, json = "";

	// Read in the whole file at once, since we can't easily parse a JSON stream. The 
	// chunk size here is pretty arbitrary, although larger chunk sizes may be marginally
	// faster. We set it to 1MB.
	while ((str = Z.read(1048576)) !== false) json += str;

	try {
		return JSON.parse(json);
	} catch(e) {
		Zotero.debug(e);
	}
}

function getEntityTypes(entity) {
	const types = new Set();
	if (entity.claims && entity.claims[INSTANCE_OF]) {
		for (const claim of entity.claims[INSTANCE_OF]) {
			if (
				claim.mainsnak &&
				claim.mainsnak.datavalue &&
				claim.mainsnak.datavalue.value &&
				claim.mainsnak.datavalue.value.id
			) {
				const type = typeMapping[claim.mainsnak.datavalue.value.id];
				if (type) types.add(type);
			}
		}
	}
	return [...types];
}

function getEntitiesUrl({
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

	ids = ids.join('|');
	languages = languages.join('|');
	props = props.join('|');

	const params = [];
	params.push('action=wbgetentities');
	if (ids) params.push('ids=' + ids);
	if (languages) params.push('languages=' + languages);
	if (props) params.push('props=' + props);
	params.push('format=' + format);
	if (languagefallback) params.push('languagefallback');
	params.push('origin=*');

	return baseUrl + params.join('&');
}

function detectImport() {
	const parsedData = parseInput();
	if (
		parsedData &&
		parsedData.entities &&
		Object.values(parsedData.entities).some(
			(entity) => getEntityTypes(entity).length > 0
		)
	) {
		return true
	} else {
		return false;
	}
}

function doImport() {
	const parsedData = parseInput();
	const entities = Object.values(parsedData.entities);

	const items = {};
	const claims = {};
	for (const entity of entities) {
		const types = getEntityTypes(entity);
		if (types.length > 0) {
			// console.log(`Creating new item for ${entity.id}`);
			let hasTitle = false;
			const item = new Zotero.Item(types[0]);
			if (entity.labels && entity.labels[LOCALE]) {
				item.title = entity.labels[LOCALE].value;
			}
			item.extra = `qid: ${entity.id}`;
			items[entity.id] = item;
			claims[entity.id] = [];
			for (const property of Object.keys(entity.claims)) {
				if (Object.keys(mapping).includes(property)) {
					if (property === TITLE) hasTitle = true;
					for (const claim of entity.claims[property]) {
						claims[entity.id].push(claim);
					}
				}
			}
			if (!hasTitle) {
				// if no "title" claims available for the entity
				let dataValue;
				if (entity.labels && entity.labels[LOCALE]) {
					// if entity label was provided, use it as "title" claim
					dataValue = {
						type: 'monolingualtext',
						value: {
							text: entity.labels[LOCALE].value
						}
					}
				} else {
					// otherwise, give item id as "title" claim to be handled
					// by the updateItems method
					dataValue = {
						type: 'wikibase-entityid',
						value: {
							id: entity.id
						}
					}
				}
				claims[entity.id].push({
					mainsnak: {
						property: TITLE,
						datavalue: dataValue
					}
				});
			}
		}
	}
	updateItems(items, claims);
}

function updateItems(items, claims, labels={}) {
	let wikibaseItems = new Set();
	const pendingClaims = {};
	for (const id of Object.keys(items)) {
		const item = items[id];
		const itemClaims = claims[id];
		pendingClaims[id] = [];
		if (itemClaims.length) {
			// console.log(`Updating item for ${id}`);
			for (const claim of itemClaims) {
				const datavalue = claim.mainsnak.datavalue;
				const valuetype = datavalue.type;
				let value;
				if (valuetype === 'wikibase-entityid') {
					const valueId = datavalue.value.id;
					if (labels[valueId]) {
						value = labels[valueId];
					} else {
						pendingClaims[id].push(claim);
						if (wikibaseItems.size < 50) {
							wikibaseItems.add(datavalue.value.id);
						}
					}
				} else {
					switch (valuetype) {
						case 'string':
							value = datavalue.value;
							break;
						case 'time':
							value = datavalue.value.time;
							break;
						case 'globecoordinate':
							value = `${datavalue.value.latitude}, ${datavalue.value.longitude}`;
							break;
						case 'quantity':
							value = datavalue.value.amount;
							break;
						case 'monolingualtext':
							value = datavalue.value.text;
							break;
						default:
							console.error('Unknown datavalue type', valuetype);
					}
				}
				if (value) {
					// console.log(`${id} - ${property}: ${value}`)
					updateItem(item, claim, value);
				}
			}
			if (!pendingClaims[id].length) {
				// console.log(`Completing item for ${id}`);
				if (item.title && item.subtitle) {
					item.title += ': ' + item.subtitle;
					delete item.subtitle;
				}
				if (item.creatorsArray) {
					item.creatorsArray.sort((a, b) => (
						a.seriesOrdinal - b.seriesOrdinal
					));
					for (const aut of item.creatorsArray) {
						item.creators.push(ZU.cleanAuthor(aut.value, aut.func));
					}
					delete item.creatorsArray;
				}
				//in Zotero we cannot allow multiple DOIs
				if (item.DOI) {
					item.DOI = [
						...item.DOI.preferred,
						...item.DOI.normal,
						...item.DOI.deprecated
					][0];
				}
				item.complete();
			}
		}
	}
	if (wikibaseItems.size > 0) {
		const lang = LOCALE;
		const url = getEntitiesUrl({
			ids: [...wikibaseItems],
			props: ['labels'],
			languages: [lang]
		})
		// console.log(url);
		ZU.doGet(url, (data) => updateItems(items, pendingClaims, parseLabels(data, lang)));
	} else {
		if (Object.values(pendingClaims).some(
			(pendingItemClaims) => pendingItemClaims.length > 0)
		) {
			console.error('Unexpected pending claims with empty wikibaseItems array!');
		}
	}
}

function parseLabels(data, lang) {
	const labels = {};
	const entities = JSON.parse(data).entities;
	for (const entity of Object.values(entities)) {
		labels[entity.id] = entity.labels[lang] ? entity.labels[lang].value : entity.id;
	}
	return labels;
}

function updateItem(item, claim, value) {
	const property = claim.mainsnak.property;
	const zprop = mapping[property];
	if (zprop === 'creator') {
		let seriesOrdinal = 0;
		if (claim.qualifiers && claim.qualifiers[SERIES_ORDINAL]) {
			seriesOrdinal = claim.qualifiers[SERIES_ORDINAL][0].datavalue.value;
		}
		var func = creatorMapping[property] || 'contributor';
		if (!item.creatorsArray) item.creatorsArray = [];
		item.creatorsArray.push(
			{value, func, seriesOrdinal}
		);
	} else if (zprop === 'DOI') {
		const rank = claim.rank;
		if (!item[zprop]) item[zprop] = {
			'preferred': [],
			'normal': [],
			'deprecated': []
		};
		item[zprop][rank].push(value);
	} else if (zprop === 'tagString') {
		item.tags.push(value);
	} else if (item[zprop]) {
		item[zprop] += ', ' + value;
	} else {
		item[zprop] = value;
	}
}
