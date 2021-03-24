import Wikicite from './wikicite';
import Wikidata from './wikidata';

/* global Zotero */

// Fixme: maybe pass a save handler to the constructor
// to be run after each setter. This would be the item's saveTx
// for source items, and the source item's saveTx for target items
export default class ItemWrapper{
	constructor(item, saveHandler) {  // key
		// beware this property set like this allows others to change it
		// if this is not desired, change to this._item and create a
		// getter/setter pair
		this.item = item;
		// this.key = key;
		this.saveHandler = saveHandler;
	}

	// Frequently used Zotero.Item fields
    get title() {
		return this.item.getField('title');
    }

    set title(title) {
        this.item.setField('title', title)
        this.saveHandler();
    }

    get type() {
        return Zotero.ItemTypes.getName(this.item.itemTypeID);
    }

    set type(typeName) {
        // I may limit types to journal article, book and book chapter
        const typeID = Zotero.ItemTypes.getID(typeName);
        this.item.setType(typeID);
        this.saveHandler();
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
		const doi = this.item.getField('DOI');
		return doi;
	}

	set doi(doi) {
		this.item.setField('DOI', doi);
		this.saveHandler();
	}

    get isbn() {
        const doi = this.item.getField('ISBN');
        return doi;
    }

    set isbn(isbn) {
        this.item.setField('ISBN', isbn);
        this.saveHandler();
    }

	get qid() {
		const qid = Wikicite.getExtraField(this.item, 'qid').values[0];
		return qid;
	}

	set qid(qid) {
		Wikicite.setExtraField(this.item, 'qid', qid);
		this.saveHandler();
	}

    // OpenCitations Corpus Internal Identifier
    get occ() {
        const occ = Wikicite.getExtraField(this.item, 'occ').values[0];
        return occ;
    }

    set occ(occ) {
        Wikicite.setExtraField(this.item, 'occ', [occ]);
        this.saveHandler();
    }

    // other uids may be useful to lookup in wikidata
    // but in principle I wouldn't deal with them
    // this.extra.pmcid;
    // this.extra.pmid;

    getLabel() {
        const firstCreator = this.item.getField('firstCreator');
        const year = this.item.getField('year');
        const title = this.item.getField('title');
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

    async fetchQid() {
        const qids = await Wikidata.getQID(this);
        const qid = qids.get(this);
        if (qid) {
            this.qid = qid;
        }
    }
}
