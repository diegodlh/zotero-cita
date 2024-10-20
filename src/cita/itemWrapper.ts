/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import Crossref from "./crossref";
import OpenAlex from "./openalex";
import OpenCitations from "./opencitations";
import Progress from "./progress";
import Semantic from "./semantic";
import Wikicite from "./wikicite";
import Wikidata from "./wikidata";
import PID from "./PID";

// maybe pass a save handler to the constructor
// to be run after each setter. This would be the item's saveTx
// for source items, and the source item's saveTx for target items
export default class ItemWrapper {
	key?: string;
	saveHandler: any;
	item: Zotero.Item;
	// item(item: any): any {
	//     throw new Error('Method not implemented.');
	// }
	constructor(item?: Zotero.Item, saveHandler?: () => void) {
		if (item === undefined) item = new Zotero.Item();
		if (saveHandler === undefined) saveHandler = item.saveTx;

		if (!item.isRegularItem()) {
			throw new Error("Cannot wrap non-regular items");
		}
		// beware this property set like this allows others to change it
		// if this is not desired, change to this._item and create a
		// getter/setter pair
		this.item = item;
		this.key = item.key;
		this.saveHandler = saveHandler;
	}

	// Frequently used Zotero.Item fields
	get title() {
		return this.item.getField("title");
	}

	set title(title) {
		this.item.setField("title", title);
		this.saveHandler();
	}

	get type() {
		return Zotero.ItemTypes.getName(this.item.itemTypeID);
	}

	set type(typeName) {
		// I may limit types to journal article, book and book chapter
		const typeID = Zotero.ItemTypes.getID(typeName);
		if (typeID) {
			this.item.setType(typeID);
			this.saveHandler();
		}
	}

	// this.publicationDate = publicationDate;
	// this.publisher = publisher;
	// this.volume = volume;
	// this.issue;
	// this.pages = pages;
	// this.doi = doi
	// this.isbn; // for books
	// this.place; // for books?

	// UUIDs
	get doi(): DOI | undefined {
		return this.getPID("DOI")?.id as DOI;
	}

	set doi(doi: DOI) {
		this.setPID("DOI", doi);
	}

	get isbn(): string | undefined {
		return this.getPID("ISBN")?.id;
	}

	set isbn(isbn: string) {
		this.setPID("ISBN", isbn);
	}

	get qid(): QID | undefined {
		return this.getPID("QID")?.id as QID;
	}

	set qid(qid: QID) {
		this.setPID("QID", qid);
	}

	get omid(): OMID | undefined {
		return this.getPID("OMID")?.id as OMID;
	}

	set omid(omid: OMID) {
		this.setPID("OMID", omid);
	}

	get url(): string | null {
		const url = this.item.getField("url");
		return (
			url ||
			this.getPidUrl("QID") ||
			this.getPidUrl("DOI") ||
			this.getPidUrl("OMID")
		);
	}

	static readonly allTypesToShow: PIDType[] = [
		"DOI",
		"ISBN",
		"QID",
		"OMID",
		"arXiv",
		"OpenAlex",
		"CorpusID",
		// Don't show PMID or PMCID because we can't fetch citations from them
	];

	getPIDTypes() {
		const pidTypes: PIDType[] = [];
		for (const type of ItemWrapper.allTypesToShow) {
			switch (type) {
				case "DOI":
				case "ISBN":
					if (this.isValidField(type)) {
						pidTypes.push(type);
					}
					break;
				case "arXiv":
					if (this.item.itemType === "preprint") {
						pidTypes.push(type);
					}
					break;
				default:
					pidTypes.push(type);
			}
		}
		return pidTypes;
	}

	static readonly fetchablePIDs: PIDType[] = [
		"QID",
		"OMID",
		"OpenAlex",
		"DOI",
		"CorpusID",
	];

	canFetchPid(type: PIDType) {
		return ItemWrapper.fetchablePIDs.includes(type);
	}

	async fetchPID(type: PIDType, autosave = true) {
		if (!this.canFetchPid(type)) {
			Services.prompt.alert(
				window as mozIDOMWindowProxy,
				Wikicite.getString("wikicite.global.unsupported"),
				Wikicite.formatString(
					"wikicite.item-wrapper.fetch-pid.unsupported",
					type,
				),
			);
			return;
		}

		const progress = new Progress(
			"loading",
			Wikicite.formatString(
				"wikicite.item-wrapper.fetch-pid.loading",
				type,
			),
		);
		let pids: PID[] = [];
		switch (type) {
			case "QID": {
				const qids = await Wikidata.reconcile([this]);
				const qid = qids?.get(this);
				if (qid) {
					pids.push(new PID("QID", qid));
				}
				break;
			}
			case "OMID": {
				const _pids = await new OpenCitations().fetchPIDs(this);
				if (_pids) pids = _pids;
				break;
			}
			case "DOI": {
				const doi = await new Crossref().fetchDOI(this);
				if (doi) pids = [doi];
				break;
			}
			case "OpenAlex": {
				const _pids = await new OpenAlex().fetchPIDs(this);
				if (_pids) pids = _pids;
				break;
			}
			case "CorpusID": {
				const _pids = await new Semantic().fetchPIDs(this);
				if (_pids) pids = _pids;
				break;
			}
		}
		if (pids && pids.length) {
			progress.updateLine(
				"done",
				Wikicite.formatString(
					"wikicite.item-wrapper.fetch-pid.done",
					type,
				),
			);
			progress.close();
			pids.forEach((pid) => {
				// Only set the PID if it's not already set or if it's the one we were actually fetching/refreshing
				if (!this.getPID(pid.type) || type === pid.type)
					this.setPID(pid.type, pid.cleanID || pid.id, autosave);
			});
		} else {
			progress.updateLine(
				"error",
				Wikicite.formatString(
					"wikicite.item-wrapper.fetch-pid.error",
					type,
				),
			);
			progress.close();
		}
	}

	/*
	 * Get PID (QID, DOI, ISBN, OMID, ...) from item. If it doesn't have this PID, return undefined
	 */
	getPID(type: PIDType, clean = false): PID | null {
		let _pid: string;
		switch (type) {
			case "DOI":
			case "ISBN":
				_pid = this.item.getField(type);
				break;
			case "arXiv": {
				const field = this.item.getField("archiveID");
				if (field && field.startsWith("arXiv:")) {
					_pid = field.replace("arXiv:", "");
				} else {
					_pid = Wikicite.getExtraField(this.item, "arXiv").values[0];
				}
				break;
			}
			default:
				_pid = Wikicite.getExtraField(this.item, type).values[0]; // this could be undefined
		}
		if (_pid) {
			const pid = new PID(type, _pid);
			if (clean) return pid.cleaned();
			return pid;
		}
		return null;
	}

	/**
	 * Return the first available PID from a list of PID types.
	 * @param item Item wrapper to get the PID from.
	 * @param pidTypes List of PID types to check for, by order of preference.
	 * @returns PID or null if none available
	 */
	getBestPID(pidTypes: PIDType[]): PID | null {
		for (const type of pidTypes) {
			const pid = this.getPID(type, true); // Already clean them up
			if (pid) return pid;
		}

		return null;
	}

	getPidUrl(type: PIDType) {
		const cleanPID = this.getPID(type, true);
		let url;
		return cleanPID ? cleanPID.url : null;
	}

	setPID(type: PIDType, value: string, save = true) {
		switch (type) {
			case "DOI":
			case "ISBN":
				if (this.isValidField(type)) {
					this.item.setField(type, value);
				} else {
					throw new Error(
						`Unsupported PID ${type} for item type ${this.type}`,
					);
				}
				break;
			case "arXiv":
				if (this.isValidField("archiveID")) {
					this.item.setField("archiveID", "arXiv:" + value);
				} else {
					Wikicite.setExtraField(this.item, type, [value]);
				}
				break;
			default:
				Wikicite.setExtraField(this.item, type, [value]);
		}
		if (save) this.saveHandler();
	}

	isValidField(fieldName: string): boolean {
		return Zotero.ItemFields.isValidForType(
			Zotero.ItemFields.getID(fieldName),
			this.item.itemTypeID,
		);
	}

	getLabel() {
		const firstCreator = this.item.getField("firstCreator");
		const year = this.item.getField("year");
		const title = this.item.getField("title");
		const labelParts = [];
		if (firstCreator) {
			labelParts.push(firstCreator);
		}
		if (year) {
			labelParts.push(`(${year})`);
		}
		if (title) {
			labelParts.push(title);
		}
		const label = labelParts.join(year ? " " : " - ");
		return label;
	}

	fromJSON(json: object) {
		// Adapted from Zotero.Item.fromJSON for faster performance
		// const itemTypeID = Zotero.ItemTypes.getID(json.itemType);
		// if (itemTypeID) {
		// 	this.item.setType(itemTypeID);
		// }
		// for (const [key, value] of Object.entries(json)) {
		// 	if (key === "creators") {
		// 		this.item.setCreators(value);
		// 	} else if (key !== "itemType") {
		// 		this.item.setField(key, value);
		// 	}
		// }
		this.item.fromJSON(json);
	}

	toJSON() {
		// Adapted from Zotero.Item.toJSON for faster performance
		// const json: { [key: string]: any } = {
		// 	itemType: Zotero.ItemTypes.getName(this.item.itemTypeID),
		// 	creators: this.item.getCreatorsJSON(),
		// };
		// for (const i in this.item._itemData) {
		// 	const val = String(this.item.getField(i));
		// 	if (val !== "") {
		// 		json[Zotero.ItemFields.getName(i) as string] = val;
		// 	}
		// }
		// return json;
		return this.item.toJSON();
	}
}
