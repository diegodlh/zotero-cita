import Wikicite from './wikicite';

/* global Zotero */

export default class Crossref{
	static async getCitations(doi) {
        const JSONResponse = await Crossref.getDOI(doi);

        if (JSONResponse){
            const references = JSONResponse.message.reference
            if (references && references.length > 0){
                const parsedReferences = await Promise.all(references.map(async (reference) => {
                    const parsedReference = await Crossref.parseReferenceItem(reference);
                    return parsedReference;
                }));
                return parsedReferences.filter(Boolean);
            }
            else{
                Zotero.debug("Item found in Crossref but doesn't contain any references");
            }
        }
        return [];
	}

    static async parseReferenceItem(crossrefItem){
        let newItem = null;
        if (crossrefItem.DOI){
            newItem = await this.getItemFromIdentifier({DOI: crossrefItem.DOI});
        }
        else if(crossrefItem.isbn){
            newItem = await this.getItemFromIdentifier({ISBN: crossrefItem.ISBN});
        }
        else{
            newItem = this.getItemFromCrossrefReference(crossrefItem);
        }
        return newItem;
    }

    static async getItemFromIdentifier(identifier){
        await Zotero.Schema.schemaUpdatePromise;
        let translation = new Zotero.Translate.Search();
        translation.setIdentifier(identifier);

        let jsonItems;
        try {
            // set libraryID to false so we don't save this item in the Zotero library
            jsonItems = await translation.translate({libraryID: false});
        } catch {
            Zotero.debug('No items returned for identifier ' + identifier);
        }

        if (jsonItems) {
            const jsonItem = jsonItems[0];
            const newItem = new Zotero.Item(jsonItem.itemType);
            newItem.fromJSON(jsonItem);
            return newItem;
        }
        else{
            return null;
        }
    }

    static getItemFromCrossrefReference(crossrefItem){
        let jsonItem = {};
        if (crossrefItem['journal-title']){
            jsonItem.itemType = 'journalArticle';
            jsonItem.title = crossrefItem['article-title'] || crossrefItem['volume-title'];
        }
        else if(crossrefItem['volume-title']){
            jsonItem.itemType = 'book';
            jsonItem.title = crossrefItem['volume-title'];
        }
        else if(crossrefItem.unstructured){
            // todo: Implement reference text parsing here
            Zotero.debug("Couldn't parse Crossref reference - unstructured references are not yet supported. " + JSON.stringify(crossrefItem));
            return null;
        }
        else{
            Zotero.debug("Couldn't determine type of Crossref reference - doesn't contain `journal-title` or `volume-title` field. " + JSON.stringify(crossrefItem));
            return null;
        }
        jsonItem.date = crossrefItem.year;
        jsonItem.pages = crossrefItem['first-page'];
        jsonItem.volume = crossrefItem.volume;
        jsonItem.issue = crossrefItem.issue;
        jsonItem.creators = [{
            'creatorType': 'author',
            'name': crossrefItem.author
        }];
        // remove undefined properties
        for (let key in jsonItem){
            if(jsonItem[key] === undefined){
                delete jsonItem[key];
            }
        }
        const newItem = new Zotero.Item(jsonItem.itemType);
        newItem.fromJSON(jsonItem);
        return newItem;
    }

	static async getDOI(doi) {
        let url = "https://api.crossref.org/works/" + doi;
        let JSONResponse;

        try{
            const response = await Zotero.HTTP.request('GET', url);
            JSONResponse = JSON.parse(response.responseText);
        }
        catch {
            Zotero.debug("Couldn't access URL: " + url);
        }

        return JSONResponse;
	}
}
