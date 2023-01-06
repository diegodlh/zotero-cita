import Wikicite, { debug } from './wikicite';
import Citation from './citation';
import Progress from './progress';
/* global Services */
/* global Zotero */
/* global window */

export default class Crossref{

    /**
     * Get source item citations from CrossRef.
     * @param {SourceItemWrapper[]} sourceItems - One or more source items to get citations for.
     */
    static async addCrossrefCitationsToItems(sourceItems){

        // Make sure that at least some of the source items have DOIs
        const sourceItemsWithDOI = sourceItems.filter((sourceItem) => sourceItem.getPID('DOI'));
        if (sourceItemsWithDOI.length == 0){
            Services.prompt.alert(
                window,
                Wikicite.getString('wikicite.crossref.get-citations.no-doi-title'),
                Wikicite.getString('wikicite.crossref.get-citations.no-doi-message')
            );
            return;
        }

        // Get reference information for items from CrossRef
        const progress = new Progress(
            'loading',
            Wikicite.getString('wikicite.crossref.get-citations.loading')
        );

        let sourceItemReferences;
        try{
             sourceItemReferences = await Promise.all(
                sourceItemsWithDOI.map(async (sourceItem) => await Crossref.getReferences(sourceItem.doi))
            );
        }
        catch (error){
            progress.updateLine(
                'error',
                Wikicite.getString('wikicite.crossref.get-citations.error-getting-references')
            );
            debug(error);
            return;
        }
        
        // Confirm with the user to add these citations
        const numberOfCitations = sourceItemReferences.map((references) => references.length);
        const itemsToBeUpdated = numberOfCitations.filter((number) => number > 0).length;
        const citationsToBeAdded = numberOfCitations.reduce((sum, value) => sum + value, 0);
        if (citationsToBeAdded == 0){
            progress.updateLine(
                'error',
                Wikicite.getString('wikicite.crossref.get-citations.no-references')
            );
            return;
        }
        const confirmed = Services.prompt.confirm(
            window,
            Wikicite.getString('wikicite.crossref.get-citations.confirm-title'),
            Wikicite.formatString('wikicite.crossref.get-citations.confirm-message', [itemsToBeUpdated, sourceItems.length, citationsToBeAdded])
        )
        if (!confirmed){
            progress.close();
            return;
        }
            
        // Parse this reference information, then add to sourceItems
        progress.updateLine(
            'loading',
            Wikicite.getString('wikicite.crossref.get-citations.parsing')
        );

        try {
            let parsedItems = 0;
            const parsedItemReferences = await Promise.all(sourceItemReferences.map(async (sourceItemReferenceList) => {
                if (!sourceItemReferenceList.length)
                    return [];
                
                const parsedReferences = await Crossref.parseReferences(sourceItemReferenceList);
                progress.updateLine(
                    'loading',
                    Wikicite.formatString('wikicite.crossref.get-citations.parsing-progress', [++parsedItems, itemsToBeUpdated])
                );
                return parsedReferences;
            }));
            
            // Add these citations to the items
            await Zotero.DB.executeTransaction(async function() {
                sourceItemsWithDOI.forEach((sourceItem, index) => {
                    const newCitedItems = parsedItemReferences[index];
                    if (newCitedItems.length > 0){
                        const newCitations = newCitedItems.map((newItem) => new Citation({item: newItem, ocis: []}, sourceItem));
                        sourceItem.addCitations(newCitations);
                    }
                });
            });
            progress.updateLine(
                'done',
                Wikicite.getString('wikicite.crossref.get-citations.done')
            );
        }
        catch (error){
            progress.updateLine(
                'error',
                Wikicite.getString('wikicite.crossref.get-citations.error-parsing-references')
            );
            debug(error);
        }
        finally {
            progress.close();
        }
    }

    /**
     * Get a list of references from Crossref for an item with a certain DOI.
     * Returned in JSON Crossref format.
     * @param {string} doi - DOI for the item for which to get references.
     * @returns {Promise<string[]>} list of references, or [] if none.
     */
    static async getReferences(doi) {
        const url = `https://api.crossref.org/works/${Zotero.Utilities.cleanDOI(
            doi
        )}`;
        const options = {
            headers: {
                "User-Agent": `${Wikicite.getUserAgent()} mailto:cita@duck.com`,
            },
            responseType: "json",
        };

        const response = await Zotero.HTTP.request("GET", url, options).catch((e) =>
            debug(`Couldn't access URL: ${url}. Got status ${e.xmlhttp.status}.`)
        );
        if (!response) return [];

        return response.response.message.reference || [];
    }

    /**
     * Parse a list of references in JSON Crossref format.
     * @param {string[]} crossrefReferences - Array of Crossref references to parse to Zotero items.
     * @returns {Promise<Zotero.Item[]>} Zotero items parsed from references (where parsing is possible).
     */
     static async parseReferences(crossrefReferences) {
        if (!crossrefReferences.length) {
            debug("Item found in Crossref but doesn't contain any references");
            return [];
        }

        const parsedReferences = await Zotero.Promise.allSettled(
            crossrefReferences.map(async (crossrefItem) => {
                if (crossrefItem.DOI)
                    return this.getItemFromIdentifier({ DOI: crossrefItem.DOI });

                if (crossrefItem.isbn)
                    return this.getItemFromIdentifier({ ISBN: crossrefItem.ISBN });

                return this.parseItemFromCrossrefReference(crossrefItem);
            })
        );
        return parsedReferences
            .map((reference) => reference.value || null)
            .filter(Boolean);
    }

    /**
     * Get a Zotero Item from a valid Zotero identifier - includes DOI, ISBN, PMID, ArXiv ID, and more.
     * @param {{string: string}} identifier - A reference item in JSON Crossref format.
     * @returns {Promise<Zotero.Item | null>} Zotero item parsed from the identifier, or null if parsing failed.
     */
    static async getItemFromIdentifier(identifier){
        await Zotero.Schema.schemaUpdatePromise;
        let translation = new Zotero.Translate.Search();
        translation.setIdentifier(identifier);

        let jsonItems;
        try {
            // set libraryID to false so we don't save this item in the Zotero library
            jsonItems = await translation.translate({libraryID: false});
        } catch {
            debug(`No items returned for identifier ${identifier}`);
            // We could get a 429 error inside the translation if we make too many
            // requests to Crossref too quickly. Would need to be fixed in Zotero...
            // I don't think we can identify this here unfortunately...
            // (See https://forums.zotero.org/discussion/84985/new-odd-result-when-importing-pmids-with-magic-wand)
            }
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

    /**
     * Get a Zotero Item from a Crossref reference item that doesn't include an identifier.
     * @param {string} crossrefItem - A reference item in JSON Crossref format.
     * @returns {Promise<Zotero.Item>} Zotero item parsed from the identifier, or null if parsing failed.
     */
    static parseItemFromCrossrefReference(crossrefItem){
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
            return Promise.reject("Couldn't parse Crossref reference - unstructured references are not yet supported. " + JSON.stringify(crossrefItem));
        }
        else{
            return Promise.reject("Couldn't determine type of Crossref reference - doesn't contain `journal-title` or `volume-title` field. " + JSON.stringify(crossrefItem));
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
        return Promise.resolve(newItem);
    }
}