import Wikicite from './wikicite';

// Shouldn't the citation know about the CitationList it belongs to
// so that it can update her details herself?

/** Class representing a citation */
class Citation {
    /**
     * Create a citation.
     * @param {Object} citation - A Citation literal.
     * @param {Zotero.Item} citation.item - The citation's target item literal.
     * @param {string} citation.item.key - The citation's target item key, if linked to
     *   an item in the library.
     * @param {Array} suppliers - Array of OpenCitations suppliers.
     *   this citation.
     * @param {Zotero.Item} sourceItem - The citation's source item.
     */
    constructor(
        {
            item,
            suppliers
            // md5, // this field may be optional, and the citation will not be created if checksum doesn't match
        },
        // index,  // knowing the index in the citationList may be important
        sourceItem  // should the parent CitationList (with its source item and methods to save) be passed instead?
    ) {
        // Fixme: improve type checking of the citation object passed as argument
        if (!item || !suppliers) {
          return
        }

        // this.index = index;
        this.source = sourceItem;
        // if item has key, retrieve actual Zotero item
        if (item.key) {
            this.item = Zotero.Items.getByLibraryAndKey(this.source.libraryID, item.key);
        } else if (item instanceof Zotero.Item) {
            this.item = item;
        } else {
            if (!item.itemType) {
                // use a default item type if it was not provided in the target item literal
                // fix: move this default value out to another file or module
                item.itemType = 'journalArticle';
            }
            // Fixme: why can't I do Zotero.Item().fromJSON(item) ?
            let zoteroItem = new Zotero.Item();
            zoteroItem.fromJSON(item);
            this.item = zoteroItem;
        }

        // this.dateAdded
        // this.dateModified

        // fix: save as a Set instead of an Array?
        this.suppliers = suppliers;

        // Issue: Save and upload information about citations order
        // this.series_ordinal;
        // // crosref does provide a citation key which seems to have some ordinal information
        // // but I say to leave this out for now
    }

    // maybe I don't need all this setters/getters
    get title() {
        return this.item.getField('title')
    }
    set title(title) {
        this.item.setField('title', title)
    }
    get type() {
        return Zotero.ItemTypes.getName(this.item.itemTypeID);
    }
    set type(typeName) {
        // I may limit types to journal article, book and book chapter
        let typeID = Zotero.ItemTypes.getID(typeName);
        this.item.setType(typeID);
    }
    // this.publicationDate = publicationDate;
    // this.publisher = publisher;
    // this.volume = volume;
    // this.issue;
    // this.pages = pages;
    // this.doi = doi
    // this.isbn; // for books
    // this.place; // for books?

    get qid() {
        const qid = Wikicite.getExtraField(this.item, 'qid').values[0];
        return qid;
    }

    set qid(qid) {
        let extra = Wikicite.setExtraField(this.item, 'qid', [qid]);
        this.item.setField('extra', extra);
    }

    // OpenCitations Corpus Internal Identifier
    get occ() {
        const occ = Wikicite.getExtraField(this.item, 'occ').values[0];
        return occ;
    }

    set occ(occ) {
        let extra = Wikicite.setExtraField(this.item, 'occ', [occ]);
        this.item.setField('extra', extra);
    }
    // other uids may be useful to lookup in wikidata
    // but in principle I wouldn't deal with them
    // this.extra.pmcid;
    // this.extra.pmid;

    addCreator(creatorType, creatorName) {
        // I may limit author types to author and editor
    }

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

    /**
     * Return a JSON object to save to the source item extra field.
     */
    toJSON() {
        let item = this.item.toJSON();
        delete item.version;
        delete item.tags;
        delete item.collections;
        delete item.relations;
        return {
            item: item,
            suppliers: this.suppliers
        }
    }

    sync() {
        // upload this and only this citation to wikidata
        // check if both this.sourceItem and this.item have qid
        // do not proceed if this.suppliers includes wikidata already
        // use Wikidata.getCitations(this.sourceItem) to see if it's already uploaded
        // if not, use Wikidata.addCitation(this.sourceItem.qid, this.item.qid)
        // add wikidata to this.suppliers
        // how do I save changes to sourceItem extra field now?
        // I need access to the parent CitationList
    }

    getOCI(provider) {
        // link to the generator (instead of the resolved URL), so the resolutor can generate the entry (?)
        // next to each citation, I may provide these links as icons
        // icons are clickable (grey if provider is unavailable yet) to export as CROCI, or sync to wikidata for individual citations
        // if click when grey, offer to upload
        // if clieck when colored, go to the OCI resolver
        // they are grey but not clickable if either soource or target dont' have DOI or QID; respectively
        // makes no sense to export to CROCI if already in COCI, I think
        // for OCC no link is provided
        if (provider in this.providers) {
            // https://opencitations.net/oci
            // Fix: possibly these two maps below should be defined elsewhere
            // Identifier type (doi, qid, etc) for each of the suppliers
            // supported by OCI
            let idType = new Map([
                ['crossref', 'doi'],
                ['wikidata', 'qid'],
                ['occ', 'occ'],
                ['dryad', 'doi'],
                ['croci', 'doi']
            ])
            // OCI prefix for each of the OCI suppliers
            let ociPrefix = new Map([
                ['crossref', 'doi'],
                ['wikidata', 'qid'],
                ['occ', 'occ'],
                ['dryad', 'doi'],
                ['croci', 'doi']
            ])
            let { values: sourceID } = Wikicite.getExtraField(this.source.getField('extra'), idType.get(provider))
            let { values: targetID } = Wikicite.getExtraField(this.item.getField('extra'), idType.get(provider))
            if (idType.get(provider) === 'doi') {
                sourceID = OpenCitations.OCI.parseDOI(sourceID[0]);
                targetID = OpenCitations.OCI.parseDOI(targetID[0]);
            } else if (idType.get(provider) === 'qid') {
                // remove leading Q
                sourceID = sourceID.substring(1);
                targetID = targetID.substring(1);
            }
            // return OpenCitations.OCI.get(provider, this.source, this.item)
            return `${ociPrefix.get(provider)}${sourceID}-${ociPrefix.get(provider)}${targetID}`
        } else {
            console.log(`${provider} provider not available for this citation.`)
        }
    }

    linkToZoteroItem() {
        // this method shall open a window to choose what item to link to
        // then it should warn the user that any information already entered will be erased

        // the source item "related" field should be updated too

        // check zotero-open-citations code because they do that!
    }
}

export default Citation;
