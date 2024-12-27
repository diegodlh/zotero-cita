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
import "core-js/proposals/set-methods-v2";

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

	/**
	 * All PID Types that are valid for the item type
	 */
	get validPIDTypes(): Set<PIDType> {
		const pidTypes = new Set<PIDType>();
		for (const type of PID.allTypes) {
			switch (type) {
				case "ISBN":
					if (this.isValidField(type)) {
						pidTypes.add(type);
					}
					break;
				case "arXiv":
					if (this.item.itemType === "preprint") {
						pidTypes.add(type);
					}
					break;
				default:
					pidTypes.add(type);
			}
		}
		return pidTypes;
	}

	/**
	 * All PID Types that the item has a PID for
	 */
	get availablePIDTypes(): Set<PIDType> {
		return new Set(
			Array.from(PID.allTypes.values()).filter((type: PIDType) =>
				this.getPID(type),
			),
		);
	}

	/**
	 * All PID Types that the item has a PID for and are valid for the item type
	 */
	get validAvailablePIDTypes(): Set<PIDType> {
		return this.validPIDTypes.intersection(this.availablePIDTypes);
	}

	get allTypesToShow(): Set<PIDType> {
		return PID.alwaysShown.union(
			PID.showable.intersection(this.validAvailablePIDTypes),
		);
	}

	canFetchPid(type: PIDType) {
		return PID.fetchable.has(type);
	}

	/**
	 * Fetch a PID for the item.
	 * @param type The PID type to fetch
	 * @param autosave Whether to save the item after fetching the PID
	 */
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

		// QID fetching has its own progress handling
		if (type === "QID") {
			const qids = await Wikidata.reconcile([this]);
			const qid = qids?.get(this);
			if (qid) {
				const pid = new PID("QID", qid);
				this.setPID(pid.type, pid.cleanID || pid.id, autosave);
			}
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
					try {
						this.setPID(pid.type, pid.cleanID || pid.id, autosave);
					} catch (e) {
						// To avoid breaking the loop in case one type is unsupported (ISBN in particular)
						Zotero.logError(e as Error);
					}
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

	/**
	 * Get PID (QID, DOI, ISBN, OMID, ...) from item. If it doesn't have this PID, return null
	 */
	getPID(type: PIDType, clean = false): PID | null {
		let _pid: string;
		switch (type) {
			case "ISBN":
				_pid = this.item.getField(type);
				break;
			case "DOI":
				if (this.isValidField(type)) {
					_pid = this.item.getField(type);
				} else {
					// Also get DOI for unsupported types
					_pid = Wikicite.getExtraField(this.item, type).values[0];
				}
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
				_pid = Wikicite.getExtraField(this.item, type).values[0];
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

	getAllPIDs(): PID[] {
		const pids: PID[] = [];
		for (const type of PID.allTypes) {
			const pid = this.getPID(type, true);
			if (pid) pids.push(pid);
		}
		return pids;
	}

	getPidUrl(type: PIDType) {
		const cleanPID = this.getPID(type, true);
		let url;
		return cleanPID ? cleanPID.url : null;
	}

	setPID(type: PIDType, value: string, save = true) {
		switch (type) {
			case "ISBN":
				if (this.isValidField(type)) {
					this.item.setField(type, value);
				} else {
					throw new Error("ISBN not supported for this item type");
				}
				break;
			case "DOI":
				if (this.isValidField(type)) {
					this.item.setField(type, value);
				} else {
					Wikicite.setExtraField(this.item, type, [value]);
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
