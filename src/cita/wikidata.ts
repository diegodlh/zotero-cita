import Wikicite, { debug } from "./wikicite";
import Progress from "./progress";
import WBK, {
	EntityId,
	PropertyId,
	SimplifiedPropertyClaims,
} from "wikibase-sdk";
// @ts-ignore - couldn't find the types for this
import qs2wbEdit from "quickstatements-to-wikibase-edit";
import wbEdit, { RequestConfig } from "wikibase-edit";
import ItemWrapper from "./itemWrapper";
import { config } from "../../package.json";
import PID from "./PID";

// this is ugly but it automatically pulls the external package versions for us
import { version as wbSdkVersion } from "../../node_modules/wikibase-sdk/package.json";
import { version as wbEditVersion } from "../../node_modules/wikibase-edit/package.json";

// Fixme: Wikibase instance and Sparql Endpoint should be
// specified in the plugin preferences, to support other
// Wikibase instances.
const WBK_INSTANCE = "https://www.wikidata.org";
const WBK_SPARQL = "https://query-scholarly.wikidata.org/sparql";
const RECONCILE_API = "https://wikidata.reconci.link/$lng/api";

const entities = {
	work: "Q386724",
};

const properties: { [name: string]: PropertyId } = {
	author: "P50",
	authorNameString: "P2093",
	citesWork: "P2860",
	doi: "P356",
	familyName: "P734",
	givenName: "P735",
	instanceOf: "P31",
	isbn10: "P957",
	isbn13: "P212",
	publicationDate: "P577",
	statedIn: "P248",
	refUrl: "P854",
	citoIntention: "P3712",
};

// Fixme: have it as a global variable like this,
// or as an instance variable like below? Pros and cons of each?
// This isn't redeclared each time the module is imported, is it?
const wdk = WBK({
	instance: WBK_INSTANCE,
	sparqlEndpoint: WBK_SPARQL,
});

const wdEdit = wbEdit({
	instance: WBK_INSTANCE,
	// can set a high value for interactive tasks where a user is waiting for the result
	// https://www.mediawiki.org/wiki/Manual:Maxlag_parameter
	maxlag: 20,
	// tags: ['Zotero_WikiCite']
});

const enum ResponseType {
	WIKIDATA,
	QUICK_STATEMENTS,
	CANCEL,
}

export default class {
	/**
	 * Fetches QIDs for item wrappers provided, using reconciliation API
	 * @param {Array|ItemWrapper} items (Array of) ItemWrapper(s)
	 * @param {Object} options
	 * @param {Boolean} options.overwrite Whether to overwrite item's known QID
	 * @param {Boolean} options.partial Whether to suggest approximate matches
	 * @param {Boolean} options.create Offer to create entity if not found in Wikidata
	 * @returns {Map} item to qid map; qid is null if not found, and undefined if not queried
	 */
	static async reconcile(
		items: ItemWrapper | ItemWrapper[],
		options = {
			overwrite: false,
			partial: !Array.isArray(items) || items.length === 1,
			create: !Array.isArray(items) || items.length === 1,
		},
	) {
		const progress = new Progress();
		// make sure an array of items was provided
		if (!Array.isArray(items)) items = [items];
		const typeMapping = await getTypeMapping();
		// create item -> qid map that will be returned at the end
		const qids: Map<ItemWrapper, QID | undefined> = new Map(
			items.map((item) => [item, item.qid]),
		);
		// iterate over the items to create the qXX query objects
		type QueryProperties = { pid: string; v: string | string[] };
		type Query = {
			query: string;
			type?: string;
			properties: QueryProperties[];
		};
		const queries: { [id: string]: Query } = {};
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item.qid && !options.overwrite) {
				// current item has qid already
				continue;
			}
			const queryProps: QueryProperties[] = [];
			const cleanDOI = Zotero.Utilities.cleanDOI(item.doi || "");
			if (cleanDOI) {
				queryProps.push({
					pid: properties.doi,
					v: cleanDOI.toUpperCase(),
				});
			}
			const cleanISBN = Zotero.Utilities.cleanISBN(item.isbn || "");
			if (cleanISBN) {
				queryProps.push({
					pid: [properties.isbn10, properties.isbn13].join("|"),
					v: cleanISBN,
				});
			}
			const creators = item.item.getCreatorsJSON();
			if (creators) {
				queryProps.push({
					pid: [properties.author, properties.authorNameString].join(
						"|",
					),
					v: creators.map((creator) =>
						[creator.firstName, creator.lastName].join(" ").trim(),
					),
				});
			}
			const year = (
				Zotero.Date.strToDate(item.item.getField("date")) as any
			).year;
			if (year) {
				queryProps.push({
					pid: properties.publicationDate + "@year",
					v: year,
				});
			}
			if (!item.title && !queryProps.length) {
				// if no title nor supported properties, skip to next item
				continue;
			}
			const queryId = `q${i}`;
			// Workaround until #84 can be fixed
			const query = item.title.replace(/^(\w+):/, "$1");
			// Add type-specific queries (#101)
			const mappedType = typeMapping[item.type];
			if (mappedType) {
				// if the Zotero item type maps to a Wikidata class
				// add type-specific (t) query
				queries[queryId + "t"] = {
					query,
					type: mappedType,
					properties: queryProps,
				};
			}
			if (options.partial) {
				// always treat untyped matches as partial matches, so only run them
				// if we're generating partial matches (reconciling a single item) #153
				queries[queryId + "u"] = {
					query,
					// type: entities.work, // broadly typed query may time out, see #149
					properties: queryProps,
				};
			}
		}
		if (Object.keys(queries).length) {
			progress.newLine(
				"loading",
				Wikicite.getString(
					"wikicite.wikidata.progress.qid.fetch.loading",
				),
			);
			// send HTTP POST request
			const response: { [id: string]: any } = {};
			try {
				const req = await Zotero.HTTP.request(
					"POST",
					RECONCILE_API.replace(
						"$lng",
						Services.locale.requestedLocale.split("-")[0],
					),
					{
						body: `queries=${encodeURIComponent(JSON.stringify(queries))}`,
						headers: {
							"User-Agent": `${Wikicite.getUserAgent()} zotero/${Zotero.version}`,
						},
						// Fixme: split large requests instead of disabling timeout #78
						timeout: 0,
					},
				);
				const tmpResponse = JSON.parse(req.response);
				for (let i = 0; i < items.length; i++) {
					const queryId = `q${i}`;
					const typedQueryId = `q${i}t`;
					const untypedQueryId = `q${i}u`;
					const result: any[] = [];
					if (tmpResponse[typedQueryId]) {
						const typedQuery = tmpResponse[typedQueryId];
						if (
							typedQuery.result.length == 1 &&
							typedQuery.result[0].match
						) {
							// If there's just one typed result and it's a match - accept it
							// still need to rely on the match result (or checking the score) - a single match can still be bad
							response[queryId] = {
								result: [typedQuery.result[0]],
							};
							continue;
						} else if (options.partial) {
							// Otherwise, store all potential matches as partial matches
							typedQuery.result.forEach((candidate: any) => {
								candidate.match = false;
								result.push(candidate);
							});
						}
					}
					if (options.partial && tmpResponse[untypedQueryId]) {
						// If a partial match, also store untyped matches we don't already have
						const resultIDs = result.map(
							(candidate) => candidate.id,
						);
						tmpResponse[untypedQueryId].result.forEach(
							(candidate: any) => {
								if (!resultIDs.includes(candidate.id)) {
									candidate.match = false;
									result.push(candidate);
								}
							},
						);
					}
					result.sort((a, b) => b.score - a.score);
					response[queryId] = { result };
				}
				if (
					Object.values(response).some(
						(query: any) => query.result.length,
					)
				) {
					// query batch succeeded and at least one query returned results
					// fix: this says "done" when the selector pops up if only partial matches are found
					progress.updateLine(
						"done",
						Wikicite.getString(
							"wikicite.wikidata.progress.qid.fetch.done",
						),
					);
				} else {
					// query batch succeeded, but no query returned results
					progress.updateLine(
						"error",
						Wikicite.getString(
							"wikicite.wikidata.progress.qid.fetch.zero",
						),
					);
				}
			} catch (err) {
				// Handle too large batch error until openrefine-wikibase#109 is fixed
				let largeBatch = false;
				if ((err as any).xmlhttp && (err as any).xmlhttp.response) {
					const details = JSON.parse(
						(err as any).xmlhttp.response,
					).details;
					if (details) {
						const match = details.match(
							/url=URL\('https:\/\/query\.wikidata\.org\/sparql\?query=(.*)&format=json'\)/,
						);
						if (match) {
							const query = match[1];
							if (query.length > 7442) {
								largeBatch = true;
							}
						}
					}
				}
				progress.updateLine(
					"error",
					Wikicite.getString(
						"wikicite.wikidata.progress.qid.fetch.error" +
							(largeBatch ? ".large-batch" : ""),
					),
				);
			}
			progress.close();
			let cancelled = false;
			for (const [queryID, query] of Object.entries(response)) {
				if (cancelled) {
					return;
				}
				const item = items[parseInt(queryID.slice(1), 10)];
				const candidates = query.result;
				const match = candidates.filter(
					(candidate: any) => candidate.match,
				)[0];
				if (match) {
					qids.set(item, match.id);
				} else if (candidates.length && options.partial) {
					const candidateIds = candidates.map(
						(candidate: any) => candidate.id,
					);
					const matchesData = await this.getProperties(candidateIds, [
						properties.publicationDate,
						properties.author,
						properties.authorNameString,
					]);
					const authorStrings = await this.getAuthors(matchesData);
					const formatDateFromData = (idProperties: any) =>
						new Date(idProperties).getFullYear().toString();
					const formatAuthorsFromData = (authorStrings: string[]) =>
						authorStrings.length <= 2
							? authorStrings.join(" & ")
							: authorStrings[0] + " et al.";

					const choices = [
						Wikicite.getString(
							"wikicite.wikidata.reconcile.approx.none",
						),
						...candidates.map((candidate: any) => {
							let candidateStr = `${candidate.id}: ${candidate.name}`;
							if (authorStrings[candidate.id].length > 0)
								candidateStr += ` - ${formatAuthorsFromData(authorStrings[candidate.id])}`;
							if (
								matchesData[candidate.id][
									properties.publicationDate
								].length > 0
							)
								candidateStr += ` [${formatDateFromData(matchesData[candidate.id][properties.publicationDate][0])}]`;
							const typeNames = candidate.type.map(
								(type: any) => type.name,
							);
							if (typeNames.length) {
								candidateStr += ` (${typeNames.join("; ")})`;
							}
							return candidateStr;
						}),
					];
					const args = {
						choices: choices,
						message: Wikicite.formatString(
							"wikicite.wikidata.reconcile.approx.message",
							[
								item.title,
								Zotero.ItemTypes.getLocalizedString(item.type),
							],
						),
						addon: addon,
					};
					const selection: { value?: number } = {};
					window.openDialog(
						`chrome://${config.addonRef}/content/selector.xhtml`,
						"",
						"chrome,dialog=no,modal,centerscreen,resizable,width=500,height=340",
						args,
						selection,
					);
					if (selection.value) {
						if (selection.value > 0) {
							const index = selection.value - 1;
							qids.set(item, candidates[index].id);
						} else {
							// user chose 'none', meaning no candidate is relevant
							// set qid to 'null' meaning no results where found
							qids.set(item, undefined);
						}
					} else {
						// user cancelled
						// leave qid 'undefined' in qids map
						cancelled = true;
					}
				} else {
					// item is in the response
					// but response is empty
					// meaning it wasn't found in Wikidata
					// make it 'null' in the qids maps
					qids.set(item, undefined);
				}
			}
		} else {
			// no searchable items, or qids known already
			progress.newLine(
				"error",
				Wikicite.getString(
					"wikicite.wikidata.progress.qid.fetch.invalid",
				),
			);
			progress.close();
		}
		// select items unavailable in Wikidata for entity creation
		const unavailable = [];
		for (const [item, qid] of qids) {
			if (typeof qid === "undefined") {
				if (!item.title) {
					// skip items without a title
					continue;
				}
				unavailable.push(item);
			}
		}
		if (unavailable.length && options.create) {
			const result = Services.prompt.confirm(
				window as mozIDOMWindowProxy,
				Wikicite.getString(
					"wikicite.wikidata.reconcile.unavailable.title",
				),
				Wikicite.formatString(
					"wikicite.wikidata.reconcile.unavailable.message",
					unavailable.map((item) => "• " + item.title).join("\n"),
				),
			);
			if (result) {
				for (const item of unavailable) {
					const qid = await this.create(item, {
						checkDuplicates: false,
					});
					qids.set(item, qid as QID);
				}
			}
		}
		return qids;
	}

	/** Extract unique QIDs from text and return them as needed for
	 * the Wikidata translator `[{extra: "qid: Q134"}]`.
	 * 	(based on Zotero.Utilities.extractIdentifiers)
	 *
	 * @param text string from which to extract QIDs
	 * @param strict whether to require that each QID begins with a Q
	 * @returns list of QIDs as identifiers
	 */
	static extractQIDsFromText(text: string, strict: boolean = false) {
		const foundIDs: Set<QID> = new Set(); // keep track of identifiers to avoid duplicates
		const identifiers: { [identifier: string]: string }[] = [];

		// Look for QIDs
		const ids = text.split(/[\s\u00A0]+/); // whitespace + non-breaking space
		let qid;
		for (const id of ids) {
			if ((qid = PID.cleanQID(id, strict)) && !foundIDs.has(qid)) {
				identifiers.push({
					extra: `qid: ${qid}`,
				});
				foundIDs.add(qid);
			}
		}
		return identifiers;
	}

	static async zoteroItemToQuickstatements(
		item: ItemWrapper,
	): Promise<string | undefined> {
		await Zotero.Schema.schemaUpdatePromise;
		const translation = new Zotero.Translate.Export();
		if (item.item.libraryID) {
			translation.setItems([item.item]);
		} else {
			// export translation expects the item to have a libraryID
			// target (i.e., cited) items in the CitationEditor do not have one
			// create temporary item
			const tmpItem = new Zotero.Item();
			tmpItem.fromJSON(item.item.toJSON());
			tmpItem.libraryID = 1;
			translation.setItems([tmpItem]);
		}
		translation.setTranslator("51e5355d-9974-484f-80b9-f84d2b55782e"); // QuickStatements translator
		await translation.translate();
		const qsCommands = translation.string;

		return qsCommands;
	}

	static useWikidataOrQuickstatements(
		titleText: string,
		bodyText: string,
		wikidataButtonText: string,
	): ResponseType {
		const buttonFlags =
			Services.prompt.BUTTON_POS_0! *
				Services.prompt.BUTTON_TITLE_IS_STRING! +
			Services.prompt.BUTTON_POS_1! *
				Services.prompt.BUTTON_TITLE_IS_STRING! +
			Services.prompt.BUTTON_POS_2! *
				Services.prompt.BUTTON_TITLE_CANCEL!;
		const response = Services.prompt.confirmEx(
			window as mozIDOMWindowProxy,
			titleText,
			bodyText,
			buttonFlags,
			wikidataButtonText,
			Wikicite.getString("wikicite.wikidata.create.confirm.button.qs"),
			"",
			"",
			{ value: false },
		);
		return response;
	}

	static quickStatementsToURL(quickstatementsCommand: string) {
		return (
			"https://quickstatements.toolforge.org/#/v1=" +
			quickstatementsCommand
				.replaceAll("\n", "||")
				.replaceAll("\t", "|")
				.replaceAll("/", "%2F")
		);
	}

	static launchQuickstatementsCommand(quickstatementsCommand: string) {
		// launch QuickStatements
		Zotero.launchURL(this.quickStatementsToURL(quickstatementsCommand));
	}

	/**
	 * Creates a Wikidata entity for an item wrapper provided
	 * @param {ItemWrapper} item Wrapped Zotero item
	 * @param {Object} options
	 * @param {Boolean} options.checkDuplicates Whether to check for duplicates before proceeding
	 * @returns {(String|undefined|null)} qid - QID of entity created, null if cancelled, or
	 *     undefined if QID is unknown (created with QuickStatements)
	 */
	static async create(
		item: ItemWrapper,
		options = { checkDuplicates: true },
	) {
		if (options.checkDuplicates) {
			throw Error(
				"Checking for duplicates within create function non-supported.",
			);
		}
		if (!item.title) {
			throw Error("Cannot create an entity for an item without a title");
		}

		const qsCommands = await this.zoteroItemToQuickstatements(item);

		let qid;
		if (qsCommands) {
			const response = this.useWikidataOrQuickstatements(
				Wikicite.getString("wikicite.wikidata.create.confirm.title"),
				Wikicite.formatString(
					"wikicite.wikidata.create.confirm.message",
					item.title,
				),
				Wikicite.getString(
					"wikicite.wikidata.create.confirm.button.create",
				),
			);

			switch (response) {
				case ResponseType.WIKIDATA: {
					// create
					const confirm = Services.prompt.confirm(
						window as mozIDOMWindowProxy,
						Wikicite.getString(
							"wikicite.wikidata.create.auto.confirm.title",
						),
						Wikicite.formatString(
							"wikicite.wikidata.create.auto.confirm.message",
							[
								item.title,
								"https://www.wikidata.org/wiki/Wikidata:Notability",
							],
						),
					);
					if (!confirm) {
						qid = null;
						break;
					}

					// convert qs commands to wikibase-edit entity
					const { creations } = qs2wbEdit(qsCommands);

					// use wikibase-entity to create entity
					const progress = new Progress(
						"loading",
						Wikicite.getString(
							"wikicite.wikidata.create.auto.progress.loading",
						),
					);
					const login = new Login();
					do {
						if (
							!login.cancelled &&
							(!login.anonymous || login.error)
						) {
							login.prompt();
						}
						if (login.cancelled) {
							qid = null;
							progress.updateLine(
								"error",
								Wikicite.getString(
									"wikicite.wikidata.create.auto.progress.cancelled",
								),
							);
							break;
						}
						const requestConfig = {
							anonymous: login.anonymous,
							credentials: login.credentials,
							userAgent: `${Wikicite.getUserAgent()} wikibase-edit/v${wbEditVersion || "?"}`,
							summary: "",
						};
						resetCookies();
						try {
							const creation = creations[0];
							const instanceOf =
								creation.claims[properties.instanceOf][0];
							if (!instanceOf)
								throw new Error(
									"Refused to create an item of an unknown class",
								);
							requestConfig.summary =
								Wikicite.formatString(
									"wikicite.wikidata.create.auto.summary",
									`[[${instanceOf}]]`,
								) + " [[[Wikidata:Zotero/Cita|Cita]]]";
							const { entity } = await wdEdit.entity.create(
								creation,
								requestConfig,
							);
							qid = entity.id;
							progress.updateLine(
								"done",
								Wikicite.getString(
									"wikicite.wikidata.create.auto.progress.done",
								),
							);
						} catch (error) {
							login.onError(error as Error);
							if (!login.error) {
								qid = null;
								progress.updateLine(
									"error",
									Wikicite.getString(
										"wikicite.wikidata.create.auto.progress.error",
									),
								);
								throw error;
							}
						}
					} while (login.error);
					progress.close();
					break;
				}
				case ResponseType.QUICK_STATEMENTS: {
					this.launchQuickstatementsCommand(qsCommands);
					return undefined; // because we can't know the QID
				}
				case ResponseType.CANCEL:
					// cancel
					qid = null;
					break;
			}
		} else {
			// handle cases where the QS translator returns nothing?
			// e.g., if item has qid already - these items should have
			// been ignored by the function calling this.create()
			// we want to make sure no duplicate entries are created
			// for an item that might have a QID already!
		}
		return qid;
	}

	/**
	 * Gets properties from Wikidata for one or more entities
	 * @param {Array} sourceQIDs - Array of one or more entity QIDs
	 * @param {Array} properties - Array of one or more Wikidata properties to get (eg. 'P356' for doi)
	 * @returns {Promise} { entityQID: {property1: value1, property2: value2} }
	 */
	static async getProperties(
		sourceQIDs: QID | QID[],
		properties: PropertyId | PropertyId[],
	) {
		if (!Array.isArray(sourceQIDs)) sourceQIDs = [sourceQIDs];
		if (!Array.isArray(properties)) properties = [properties];
		// Fixme: alternatively, use the SPARQL endpoint to get more than 50
		// entities per request
		const urls = wdk.getManyEntities({
			ids: sourceQIDs,
			props: "claims",
			format: "json",
		});
		const data: { [id: QID]: { [id: PropertyId]: any } } = {};
		while (urls.length) {
			const url = urls.shift() as string;
			try {
				const xmlhttp = await Zotero.HTTP.request("GET", url, {
					headers: {
						"User-Agent": `${Wikicite.getUserAgent()} wikibase-sdk/v${wbSdkVersion || "?"}`,
					},
				});
				// Fixme: handle entities undefined
				const { entities } = JSON.parse(xmlhttp.response);
				for (const id of Object.keys(entities) as QID[]) {
					const entity = entities[id];
					data[id] = {};
					for (const property of properties) {
						data[id][property] = wdk.simplify.propertyClaims(
							entity.claims[property],
						);
					}
				}
			} catch (err) {
				debug("Getting properties failed", err as Error);
			}
		}
		return data;
	}

	/**
	 * Gets author details from Wikidata for one or more entities.
	 * If author name strings are provided, use them, else get strings from author QIDs
	 * @param {Array} entityData - Dictionary from getProperties function, of form: {entityQID: {P50: [authors], P2903: [author name strings]}}
	 * @returns {Promise} author string map { entityQID: [author list] }
	 */
	static async getAuthors(entityData: {
		[id: QID]: { [id: PropertyId]: string[] };
	}) {
		const authorStringMap: { [id: QID]: string[] } = {};
		const idsToQuery: EntityId[] = [];
		const entityIdsOfAuthors: { [id: QID]: QID } = {};
		for (const key of Object.keys(entityData) as QID[]) {
			const value = entityData[key];
			authorStringMap[key] = [];
			if (value[properties.author].length > 0) {
				for (const authorID of value[properties.author] as QID[]) {
					idsToQuery.push(authorID as EntityId);
					entityIdsOfAuthors[authorID] = key;
				}
			}
			if (value[properties.authorNameString].length > 0) {
				authorStringMap[key] = authorStringMap[key].concat(
					value[properties.authorNameString],
				);
			}
		}

		const urls = wdk.getManyEntities({
			ids: idsToQuery,
			props: "labels",
			languages: "en",
			format: "json",
		});
		while (urls.length) {
			const url = urls.shift() as string;
			try {
				const xmlhttp = await Zotero.HTTP.request("GET", url, {
					headers: {
						"User-Agent": `${Wikicite.getUserAgent()} wikibase-sdk/v${wbSdkVersion || "?"}`,
					},
				});
				// Fixme: handle entities undefined
				const { entities } = JSON.parse(xmlhttp.response);
				for (const id of Object.keys(entities) as QID[]) {
					authorStringMap[entityIdsOfAuthors[id]].push(
						entities[id].labels.en.value,
					);
				}
			} catch (err) {
				debug("Getting properties failed", err as Error);
			}
		}
		return authorStringMap;
	}

	/**
	 * Gets "cites work" (P2860) values from Wikidata for one or more entities
	 * @param {QID | QID[]} sourceQIDs - One or more entity QIDs
	 * @returns {Promise} Citations map { entityQID: [cites work QIDs]... }
	 */
	static async getCitesWorkClaims(sourceQIDs: QID | QID[]) {
		if (!Array.isArray(sourceQIDs)) sourceQIDs = [sourceQIDs];
		// Fixme: alternatively, use the SPARQL endpoint to get more than 50
		// entities per request, and to get only the claims I'm interested in
		// (i.e., P2860).
		const urls = wdk.getManyEntities({
			ids: sourceQIDs,
			props: ["claims"],
			format: "json",
		});
		const citesWorkClaims: { [id: QID]: SimplifiedPropertyClaims } = {};
		while (urls.length) {
			const url = urls.shift() as string;
			try {
				const xmlhttp = await Zotero.HTTP.request("GET", url, {
					headers: {
						"User-Agent": `${Wikicite.getUserAgent()} wikibase-sdk/v${wbSdkVersion || "?"}`,
					},
				});
				// Fixme: handle entities undefined
				const { entities } = JSON.parse(xmlhttp.response);
				for (const id of Object.keys(entities)) {
					const entity = entities[id];
					if (entity.claims) {
						// Note: we can't know what class(es) the "cites work"
						// objects belong to. Hence, we may be returning
						// entities of types not supported by Zotero.
						citesWorkClaims[id as QID] =
							wdk.simplify.propertyClaims(
								entity.claims[properties.citesWork],
								{
									keepIds: true,
									keepQualifiers: true,
									keepReferences: true,
								},
							);
					}
				}
			} catch (err) {
				debug('Getting "cites work" claims failed', err as Error);
			}
		}
		return citesWorkClaims;
	}

	/**
	 * Returns Zotero items using metadata retrieved from Wikidata for the QIDs provided
	 * @param {Array} qids - Array of one or more QIDs to fetch metadata for
	 * @returns {Promise} - Map of QIDs and their corresponding Zotero item
	 */
	static async getItems(qids: string[]) {
		const itemMap: Map<string, Zotero.Item | undefined> = new Map(
			qids.map((qid) => [qid, undefined]),
		);
		// this seems to fix that Zotero.Translate.Search() would fail if called
		// too early
		await Zotero.Schema.schemaUpdatePromise;
		const translate = new Zotero.Translate.Search();
		translate.setTranslator("fb15ed4a-7f58-440e-95ac-61e10aa2b4d8"); // Wikidata API
		translate.search = qids.map((qid) => ({ extra: `qid: ${qid}` }));
		// Fixme: handle "no items returned from any translator" error
		let jsonItems;
		try {
			translate.requestHeaders = {
				"User-Agent": `${Wikicite.getUserAgent()} zotero/${Zotero.version}`,
			};
			jsonItems = await translate.translate({ libraryID: false });
		} catch (err) {
			if (err === translate.ERROR_NO_RESULTS) {
				jsonItems = [];
			} else {
				throw err;
			}
		}
		for (const jsonItem of jsonItems) {
			// delete irrelevant fields to avoid warnings in Item#fromJSON
			delete jsonItem["notes"];
			delete jsonItem["seeAlso"];
			delete jsonItem["attachments"];

			// convert JSON item returned by translator into full Zotero item
			const item = new Zotero.Item();
			item.fromJSON(jsonItem);

			const qid = Wikicite.getExtraField(item, "qid").values[0];
			itemMap.set(qid, item);
		}
		return itemMap;
	}

	/**
	 * Update cites work claims on wikidata
	 * @param {{[id:QID]: CitesWorkClaim[]}} citesWorkClaims - for each item (QID) with claims to be updated - the list of claim updates
	 * @returns {Promise[{[id:QID]: string}]} - Result for updating each item's claims
	 */
	static async updateCitesWorkClaims(citesWorkClaims: {
		[id: QID]: CitesWorkClaim[];
	}) {
		const login = new Login();
		const results: {
			[id: QID]: string;
		} = {};

		// Check here whether the user wants to use wikidata directly, or Quickstatements
		const response = this.useWikidataOrQuickstatements(
			Wikicite.getString("wikicite.wikidata.sync.confirm.title"),
			Wikicite.getString("wikicite.wikidata.sync.confirm.body"),
			Wikicite.getString("wikicite.wikidata.sync.confirm.button.create"),
		);

		switch (response) {
			case ResponseType.WIKIDATA:
				for (const id of Object.keys(citesWorkClaims) as QID[]) {
					const actionType = getActionType(citesWorkClaims[id]);

					let requestConfig: RequestConfig | undefined;
					do {
						// if we haven't successfully logged in yet - try again
						if (typeof requestConfig === "undefined") {
							if (
								!login.cancelled &&
								(!login.anonymous || login.error)
							) {
								login.prompt();
							}
							if (login.cancelled) {
								results[id] = "cancelled";
								break;
							}
							requestConfig = {
								anonymous: login.anonymous,
								credentials: login.credentials,
								userAgent: `${Wikicite.getUserAgent()} wikibase-edit/v${wbEditVersion || "?"}`,
							};
						}

						try {
							resetCookies();
							const res = await wdEdit.entity.edit(
								{
									id: id,
									claims: {
										[properties.citesWork]:
											citesWorkClaims[id],
									},
									summary:
										Wikicite.formatString(
											"wikicite.wikidata.updateCitesWork." +
												actionType,
											`[[Property:${properties.citesWork}]]`,
										) + " [[[Wikidata:Zotero/Cita|Cita]]]",
								},
								requestConfig,
							);
							if (res.success) {
								login.onSuccess();
								// res returned by wdEdit.entity.edit has an entity prop
								results[id] = "ok";
							} else {
								// is it even possible to get here without an error being
								// thrown by wdEdit.entity.edit above, and caught below?
								results[id] = "unsuccessful";
							}
						} catch (error) {
							login.onError(error as Error);
							requestConfig = undefined;
							if (!login.error) {
								// if not login error, save error name and proceed with next id
								results[id] = (error as Error).name;
							}
						}
					} while (login.error);
				}
				break;
			case ResponseType.QUICK_STATEMENTS: {
				// Convert claims to quickstatements
				let quickstatementsCommands: string[] = [];
				for (const qid of Object.keys(citesWorkClaims) as QID[]) {
					if (!Object.hasOwn(citesWorkClaims, qid)) continue;

					const element = citesWorkClaims[qid];

					quickstatementsCommands = quickstatementsCommands.concat(
						element.map((citesWorkClaim) =>
							citesWorkClaim.toQuickStatements(qid),
						),
					);
				}
				this.launchQuickstatementsCommand(
					quickstatementsCommands.join("\n"),
				);
				for (const id of Object.keys(citesWorkClaims) as QID[]) {
					results[id] = "quickstatements";
				}
				break;
			}
			case ResponseType.CANCEL:
				for (const id of Object.keys(citesWorkClaims) as QID[]) {
					results[id] = "cancelled";
				}
				break;
		}
		return results;
	}
}

// error to be displayed at top, explains why you need to log in
class Login {
	cancelled: any;
	anonymous: any;
	error: string;
	accessToken: string = "";
	save?: boolean;
	constructor() {
		this.error = "";
	}

	get credentials() {
		let credentials;
		if (!this.anonymous) {
			credentials = { oauth2: { accessToken: this.accessToken } };
		}
		return credentials;
	}

	onError(error: Error | any) {
		this.error = "";
		if (error.name == "badtoken") {
			if (this.anonymous) {
				// See https://github.com/maxlath/wikibase-edit/issues/63
				this.error = "unsupportedAnonymous";
			} else {
				debug("Unexpected login error", error);
				this.error = "unknown";
			}
		} else if (error.message.split(":")[0] == "failed to login") {
			const reason = error.message.split(":")[1].trim();
			if (reason === "invalid username/password") {
				this.error = "wrongCredentials";
			} else {
				debug("Unexpected login error", error);
				this.error = "unknown";
			}
		} else if (error?.context?.body?.httpCode == 401) {
			this.error = "wrongCredentials";
		}
		// I don't want permissiondenied errors to be treated as
		// login errors, because permission may have been denied
		// for just one of multiple edits requested, and the user
		// may not have other credentials, so they would get stuck
		// in a login-error loop, of which they can only get out
		// by cancelling, thus cancelling all edits (not just the
		// one they didn't have permission for)
	}

	onSuccess() {
		this.error = "";
		if (!this.anonymous && this.save) {
			debug("Saving credentials to be implemented");
		}
	}

	prompt() {
		let promptText = "";
		if (this.error) {
			promptText +=
				Wikicite.getString(
					"wikicite.wikidata.login.error." + this.error,
				) + "\n\n";
		}
		promptText +=
			Wikicite.getString("wikicite.wikidata.login.message.main") + "\n\n";
		promptText += Wikicite.formatString(
			"wikicite.wikidata.login.message.create-account",
			"https://github.com/zotero-cita/zotero-cita/blob/master/README.md#wikidata-communication,",
		);

		const accessToken = { value: "" };
		const save = { value: false };
		let loginPrompt;
		do {
			loginPrompt = Services.prompt.promptPassword(
				window as mozIDOMWindowProxy,
				Wikicite.getString("wikicite.wikidata.login.title"),
				promptText,
				accessToken,
			);
			// if user entered username and clicked OK but forgot password
			// display prompt again
		} while (loginPrompt && !accessToken.value);
		if (loginPrompt) {
			this.accessToken = accessToken.value;
			this.anonymous = !this.accessToken;
			this.save = save.value;
		} else {
			// user cancelled login
			this.cancelled = true;
		}
	}
}

/**
 * For a set of claims, return the type of action
 * (add, edit, remove or update) that will be requested.
 */
function getActionType(claims: CitesWorkClaim[]) {
	let actionType;
	if (claims.some((claim) => claim.id)) {
		if (claims.every((claim) => claim.id)) {
			if (claims.every((claim) => claim.remove)) {
				// all claims provided have an id and are to be removed
				actionType = "remove";
			} else {
				// all claims provided have an id
				actionType = "edit";
			}
		} else {
			// some (but not all) claims provided have an id
			actionType = "update";
		}
	} else {
		// no claim provided has an id
		actionType = "add";
	}
	return actionType;
}

/**
 * Get typeMapping object from QS export translator
 */
async function getTypeMapping() {
	// wait until translation service is ready
	await Zotero.Schema.schemaUpdatePromise;
	const translator = Zotero.Translators.get(
		"51e5355d-9974-484f-80b9-f84d2b55782e", // Wikidata QuickStatements
	);
	// get the translator's code
	let code;
	try {
		code = await translator.getCode();
	} catch {
		// translator.getCode no longer supported since translation modularization
		// https://github.com/zotero/zotero/pull/2132
		code = await Zotero.Translators.getCodeForTranslator(translator);
	}
	// create a translator sandbox
	const sm = new Zotero.Translate.SandboxManager();
	// evaluate the translator's code and import the typeMapping object
	sm.eval("ZOTERO_TRANSLATOR_INFO = " + code, ["typeMapping"]);
	return sm.sandbox.typeMapping;
}

function resetCookies() {
	// remove cookies for API host before proceeding
	const cookies = Services.cookies.getCookiesFromHost(
		new URL(WBK_INSTANCE).host,
		{},
	);
	for (const cookie of cookies) {
		Services.cookies.remove(cookie.host, cookie.name, cookie.path, {});
	}
}

export class CitesWorkClaim {
	remove: boolean;
	id: any;
	value: any;
	references: any;
	qualifiers: any;
	constructor(citesWorkClaimValue: { [key: string]: any } = {}) {
		this.id = citesWorkClaimValue.id;
		this.value = citesWorkClaimValue.value;
		this.references = citesWorkClaimValue.references;
		this.qualifiers = citesWorkClaimValue.qualifiers;
		this.remove = false;
	}

	public toQuickStatements(citingQID: QID) {
		const action = this.remove ? "-" : "";
		const quickstatements = `${action}${citingQID}|${properties.citesWork}|${this.value}`;
		return quickstatements;
	}
}
