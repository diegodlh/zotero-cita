/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import Wikicite from "./wikicite";
import Wikidata from "./wikidata";

// maybe pass a save handler to the constructor
// to be run after each setter. This would be the item's saveTx
// for source items, and the source item's saveTx for target items
export default class ItemWrapper {
	key: string;
	saveHandler: any;
	item: Zotero.Item;
	// item(item: any): any {
	//     throw new Error('Method not implemented.');
	// }
	constructor(item?: any, saveHandler?: any) {
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
	get doi() {
		return this.getPID("DOI");
	}

	set doi(doi: string) {
		this.setPID("DOI", doi);
	}

	get isbn() {
		return this.getPID("ISBN");
	}

	set isbn(isbn: string) {
		this.setPID("ISBN", isbn);
	}

	get qid() {
		return this.getPID("QID");
	}

	set qid(qid: string) {
		this.setPID("QID", qid);
	}

	// OpenCitations Corpus Internal Identifier
	get occ() {
		return this.getPID("OCC");
	}

	set occ(occ) {
		this.setPID("OCC", occ);
	}

	get url() {
		const url = this.item.getField("url");
		return (
			url ||
			this.getPidUrl("QID") ||
			this.getPidUrl("DOI") ||
			this.getPidUrl("OCC")
		);
	}

	getPIDTypes() {
		const allTypes = ["DOI", "ISBN", "QID", "OCC"];
		const pidTypes = [];
		for (let type of allTypes) {
			type = type.toUpperCase();
			switch (type) {
				case "DOI":
				case "ISBN":
					if (this.isValidField(type)) {
						pidTypes.push(type);
					}
					break;
				default:
					pidTypes.push(type);
			}
		}
		return pidTypes;
	}

	async fetchPID(type: PIDType, autosave = true) {
		let pid;
		switch (type) {
			case "QID": {
				const qids = await Wikidata.reconcile([this]);
				pid = qids?.get(this);
				break;
			}
			default:
				Services.prompt.alert(
					window,
					Wikicite.getString("wikicite.global.unsupported"),
					Wikicite.formatString(
						"wikicite.item-wrapper.fetch-pid.unsupported",
						type.toUpperCase(),
					),
				);
		}
		if (pid) {
			this.setPID(type, pid, autosave);
		}
	}

	getPID(type: PIDType, clean = false) {
		let pid;
		switch (type) {
			case "DOI":
			case "ISBN":
				pid = this.item.getField(type);
				break;
			default:
				pid = Wikicite.getExtraField(this.item, type).values[0];
		}
		if (clean) {
			pid = Wikicite.cleanPID(type, pid) as string;
		}
		return pid;
	}

	getPidUrl(type: PIDType) {
		const cleanPID = this.getPID(type, true);
		let url;
		if (cleanPID) {
			switch (type) {
				case "DOI":
					url =
						"https://doi.org/" +
						// From Zotero's itembox.xml:
						// Encode some characters that are technically valid in DOIs,
						// though generally not used. '/' doesn't need to be encoded.
						cleanPID
							.replace(/#/g, "%23")
							.replace(/\?/g, "%3f")
							.replace(/%/g, "%25")
							.replace(/"/g, "%22");
					break;
				case "OCC":
					url = "https://opencitations.net/corpus/br/" + cleanPID;
					break;
				case "QID":
					url = "https://www.wikidata.org/wiki/" + cleanPID;
					break;
				default:
			}
		}
		return url;
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
			default:
				Wikicite.setExtraField(this.item, type, [value]);
		}
		if (save) this.saveHandler();
	}

	isValidField(fieldName: string) {
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
