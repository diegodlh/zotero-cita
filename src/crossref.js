import Wikicite from './wikicite';

/* global Zotero */

export default class Crossref{
	static async getCitations(doi) {
        let url = "https://api.crossref.org/works/" + doi;

        const getRequestJSON = function(url) {
            return new Promise((resolve) => {
                Zotero.HTTP.doGet(url, function (response){
                    if (response.status == 200){
                        resolve(JSON.parse(response.responseText));
                    }
                    else{
                        Zotero.debug("Couldn't access URL: " + url);
                        resolve(null);
                    }
                });
            });
        }
        const JSONResponse = await getRequestJSON(url);
        if (JSONResponse){
            const references = JSONResponse.message.reference
            let referenceItems = [];
            if (references && references.length > 0){
                for (let reference of references){
                    const referenceItem = await Crossref.parseReferenceItem(reference);
                    if (referenceItem){
                        referenceItems.push(referenceItem);
                    }
                }
            }
            else{
                // Message: we found the item in CrossRef but there were no references
            }
            return referenceItems;
        }
        else{
            return [];
        }
	}

    static async parseReferenceItem(crossrefItem){
        let newItem = null;
        let identifier;
        if (crossrefItem.DOI){
            identifier = {DOI: crossrefItem.DOI};
        }
        else if(crossrefItem.isbn){
            identifier = {ISBN: crossrefItem.ISBN};
        }
        if (identifier){
            newItem = await this.getItemFromIdentifier(identifier);
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
            const jsonItem = jsonItems[0]
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
            // Implement reference text parsing here
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

	static getDOI() {

	}
}
