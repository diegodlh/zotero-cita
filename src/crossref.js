import Wikicite, { debug } from './wikicite';
import Citation from './citation';
import Progress from './progress';
/* global Services */
/* global Zotero */
/* global window */

export default class Crossref{

    /**
     * Sync source item citations with Wikidata.
     * @param {SourceItemWrapper[]} sourceItems - One or more source items to sync citations for.
     */
    static async addCrossrefCitationsToItems(sourceItems){

        const sourceItemsWithDOI = sourceItems.filter((sourceItem) => sourceItem.getPID('DOI'));

        if (sourceItemsWithDOI.length == 0){
            Services.prompt.alert(
                window,
                Wikicite.getString('wikicite.crossref.get-citations.no-doi-title'),
                Wikicite.getString('wikicite.crossref.get-citations.no-doi-message')
            );
            return;
        }
        else if(sourceItemsWithDOI.length < sourceItems.length){
            const confirmed = Services.prompt.confirm(
                window,
                'Some items do not have DOIs', // Wikicite.getString('wikicite.crossref.get-citations.no-doi-title'),
                'Get CrossRef citations for items with DOIs?'// Wikicite.getString('wikicite.crossref.get-citations.no-doi-message')
            );
            if (!confirmed){
                return;
            }
        }

        const progress = new Progress(
            'loading',
            Wikicite.getString('wikicite.crossref.get-citations.loading')
        );

        try{
            const sourceItemCitations = await Promise.all(sourceItemsWithDOI.map(async (sourceItem) => {
                return await Crossref.getCitations(sourceItem.doi);
            }));

            const numberOfCitations = sourceItemCitations.map((citations) => citations.length);
            const itemsToBeUpdated = numberOfCitations.filter((number) => number > 0).length;
            const citationsToBeAdded = numberOfCitations.reduce((sum, value) => sum + value, 0);

            const confirmed = Services.prompt.confirm(
                window,
                'Add citations from Crossref',
                `${itemsToBeUpdated} item(s) will be updated\n${citationsToBeAdded} citation(s) will be added.`
            )
            
            if (confirmed){
                await Zotero.DB.executeTransaction(async function() {
                    for (let i = 0; i < sourceItemsWithDOI.length; i++){
                        const sourceItem = sourceItemsWithDOI[i];
                        const newCitedItems = sourceItemCitations[i];
                        if (newCitedItems.length > 0){
                            const newCitations = newCitedItems.map((newItem) => new Citation({item: newItem, ocis: []}, sourceItem));
                            sourceItem.addCitations(newCitations);
                        }
                    }
                })
                progress.updateLine(
                    'done',
                    Wikicite.getString('wikicite.crossref.get-citations.done')
                );
            }
        }
        catch (error){
            progress.updateLine(
                'error',
                Wikicite.getString('wikicite.crossref.get-citations.none')
            );
            debug(error);
        }
        finally {
            progress.close();
        }
    }

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
                debug("Item found in Crossref but doesn't contain any references");
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
            debug('No items returned for identifier ' + identifier);
        }

        if (jsonItems) {
            const jsonItem = jsonItems[0];
            // delete irrelevant fields to avoid warnings in Item#fromJSON
            delete jsonItem['notes'];
            delete jsonItem['seeAlso'];
            delete jsonItem['attachments'];

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
            debug("Couldn't parse Crossref reference - unstructured references are not yet supported. " + JSON.stringify(crossrefItem));
            return null;
        }
        else{
            debug("Couldn't determine type of Crossref reference - doesn't contain `journal-title` or `volume-title` field. " + JSON.stringify(crossrefItem));
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
            debug("Couldn't access URL: " + url);
        }

        return JSONResponse;
	}
}
