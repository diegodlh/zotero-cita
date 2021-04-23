const itemTypeAttachment = Zotero.ItemTypes.getID('attachment');
const itemTypeNote = Zotero.ItemTypes.getID('note');

// scope could be an array of item ids
// an alternative should be provided for when I want to match against
// an array of items (i.e., no SQL)

// scope or similar should be an optional variable limiting the search
// of matches to a specific subset of items. Maybe it should be an array
// of items, or a search criteria
// to be used for example by localCiationNetwork.js to assign tmp keys

// zotero search gets a search object as scope
// it creates a temporary table with the results of this search
// and then queries the database indicating that the item must be in the temp table

// but I may use a list of items instead

/**
 * Based on Zotero.Duplicates._findDuplicates
 * @param {Number} libraryID ID of the library where matches will be searched
 * @param {Array} items Array of items for which matches should be searched
 * @param {} scope 
 *

 */

class Matches {
    constructor(libraryID, scope) {
        this._libraryID = libraryID;
        this._scope = scope;
        this._isbnCache;
        this._isbnMap;
        this._doiCache;
        this._doiMap;
        this._qidCache;
        this._qidMap;
        this._yearCache;
        this._titleCache;
        this._titleMap;
        this._creatorsCache;
    }

    async init() {
        Zotero.debug('Initializing Matches');
        const start = Date.now();

        // Fixme: could I somehow run these in parallel?
        // How to run something after all of them have finished?
        // Promise.all
        await this._getISBNs();
        await this._getDOIs();
        // await this._getQIDs();
        await this._getYears();
        await this._getTitles();
        await this._getCreators();

        Zotero.debug('Matches took ' + Date.now() - start + 'ms to initialize');
    }

    findMatches(item) {
        if (
            !this._isbnCache || !this.isbnMap
            || !this._doiCache || !this._doiMap
            || !this._qidCache || !this._qidMap
            || !this._yearCache
            || !this._titleCache || !this._titleMap
            || !this._creatorsCache
        ) throw new Error("Matches hasn't been initialized yet");

        Zotero.debug("Finding matching Zotero items");
        const start = Date.now();
        // remember to apply the same clean up functions applied to the cache
        
        // ISBN
        const isbn = Zotero.Utilities.cleanISBN('' + item.getField('ISBN'));
        const isbnMatches = this._isbnMap[isbn] ?? [];

        // DOI
        const doi = Zotero.Utilities.cleanDOI('' + item.getField('DOI'))
            .toUpperCase();
        const doiMatches = this._doiMap[doi] ?? [];

        // QID

        // title
        const title = normalizeString(item.getField('title', undefined, true));
        const year = item.getField('year');
        const creators = item.getCreators().map((creator) => parseCreator(creator));

        titleMatches = [];
        for (const candidate of this.titleMap[title] ?? []) {
            // If both items have an ISBN and they don't match, it's not a match
            const candidateISBN = this._isbnCache[candidate];
            if (isbn && candidateISBN && isbn !== candidateISBN) continue;

            // If both items have a DOI and they don't match, it's not a match
            const candidateDOI = this._doiCache[candidate];
            if (doi && candidateDOI && doi !== candidateDOI) continue;

            // If both items have a QID and they don't match, it's not a match
            const candidateQID = this._qidCache[candidate];
            if (qid && candidateQID && qid !== candidateQID) continue;

            // If both items have a year and they're off by more than one, it's not a match
            const candidateYear = this._yearCache[candidate];
            if (year && candidateYear && Math.abs(year - candidateYear) > 1) continue;

            // Check for at least one match on last name + first initial of first name
            const candidateCreators = this._creatorsCache[candidate];
            if (!compareCreators(creators, candidateCreators)) continue;

            // all checks passed
            titleMatches.push(candidate);
        }

        const matches = [].concat().sort();
        Zotero.debug("Found matches in " + (Date.now() - start) + " ms");
        
        return matches;
        // is it safe to say that items with lower id will always be older?
        // how are ids assigned?        
    }

    // For all methods below, sql should be used if this._libraryID,
    // and something else should create the same rows array if items were
    // given instead
    // Also, if sql, have them use the scope as well

    async _getISBNs() {
        // Match books by ISBN
        // ISBNs are supported by item types other than books,
        // but they are types such as bookSection or conferencePaper,
        // probably referring to the book they belong to.
        // Hence, two bookSections or conferencePapers, for example,
        // may have the same ISBN
        const sql = "SELECT itemID, value FROM items JOIN itemData USING (itemID) "
            + "JOIN itemDataValues USING (valueID) "
            + "WHERE libraryID=? AND itemTypeID=? AND fieldID=? "
            + "AND itemID NOT IN (SELECT itemID FROM deletedItems)";
        const rows = await Zotero.DB.queryAsync(
            sql,
            [
                this._libraryID,
                Zotero.ItemTypes.getID('book'),
                Zotero.ItemFields.getID('ISBN')
            ]
        );
        const isbnCache = {};
        const isbnMap = {};
        for (const row of rows) {
            const newVal = Zotero.Utilities.cleanISBN('' + row.value);
            if (!newVal) continue;
            isbnCache[row.itemID] = newVal;
            if (isbnMap[newVal] === undefined) isbnMap[newVal] = [];
            isbnMap[newVal].push(row.itemID);
        }
        this._isbnCache = isbnCache;
        this._isbnMap = isbnMap;
    }

    async _getDOIs() {
        // DOI
        const sql = "SELECT itemID, value FROM items JOIN itemData USING (itemID) "
            + "JOIN itemDataValues USING (valueID) "
            + "WHERE libraryID=? AND fieldID=? AND value LIKE ? "
            + "AND itemID NOT IN (SELECT itemID FROM deletedItems)";
        const rows = await Zotero.DB.queryAsync(
            sql,
            [
                this._libraryID,
                Zotero.ItemFields.getID('DOI'),
                '10.%'
            ]
        );
        const doiCache = {};
        const doiMap = {};
        for (const row of rows) {
            // DOIs are case insensitive
            const newVal = Zotero.Utilities.cleanDOI('' + row.value).toUpperCase();
            if (!newVal) continue;
            doiCache[row.itemID] = newVal;
            if (doiMap[newVal] === undefined) doiMap[newVal] = [];
            doiMap[newVal].push(row.itemID);
        }
        this._doiCache = doiCache;
        this._doiMap = doiMap;
    }

    async _getQIDs() {}

    async _getYears() {
        // Get years
        const dateFields = [Zotero.ItemFields.getID('date')].concat(
            Zotero.ItemFields.getTypeFieldsFromBase('date')
        );
        const sql = "SELECT itemID, SUBSTR(value, 1, 4) AS year FROM items "
            + "JOIN itemData USING (itemID) "
            + "JOIN itemDataValues USING (valueID) "
            + "WHERE libraryID=? AND fieldID IN ("
            + dateFields.map(() => '?').join() + ") "
            + "AND SUBSTR(value, 1, 4) != '0000' "
            + "AND itemID NOT IN (SELECT itemID FROM deletedItems) "
        const rows = await Zotero.DB.queryAsync(sql, [this._libraryID].concat(dateFields));
        const yearCache = Object.fromEntries(rows.map((row) => [
            yearCache[row.itemID],
            row.year
        ]));
        this._yearCache = yearCache;
    }

    async _getTitles() {
        // Match on normalized title
        const titleIDs = Zotero.ItemFields.getTypeFieldsFromBase('title');
        titleIDs.push(Zotero.ItemFields.getID('title'));
        const sql = "SELECT itemID, value FROM items JOIN itemData USING (itemID) "
                    + "JOIN itemDataValues USING (valueID) "
                    + "WHERE libraryID=? AND fieldID IN "
                    + "(" + titleIDs.join(', ') + ") "
                    + `AND itemTypeID NOT IN (${itemTypeAttachment}, ${itemTypeNote}) `
                    + "AND itemID NOT IN (SELECT itemID FROM deletedItems)";
        const rows = await Zotero.DB.queryAsync(sql, [this._libraryID]);
        const titleMap = {};
        for (const row of rows) {
            const newVal = normalizeString(row.value);
            if (!newVal) continue;
            if (titleMap[newVal] === undefined) titleMap[newVal] = [];
            titleMap[newVal].push(row.itemID);
        };
        this._titleMap = titleMap;
    }

    async _getCreators() {
        // Get all creators and separate by itemID
        const sql = "SELECT itemID, lastName, firstName, fieldMode FROM items "
            + "JOIN itemCreators USING (itemID) "
            + "JOIN creators USING (creatorID) "
            + `WHERE libraryID=? AND itemTypeID NOT IN (${itemTypeAttachment}, ${itemTypeNote}) AND `
            + "itemID NOT IN (SELECT itemID FROM deletedItems)"
            + "ORDER BY itemID, orderIndex";  // Fixme: remove if alt1 chosen below
        const rows = await Zotero.DB.queryAsync(sql, this._libraryID);
        
        // creatorsCache alt1: iterate rows in order of itemID and
        // write a creatorsCache entry when itemID changes
        // is it faster because it doesn't look an itemID up in a hash table?
        let start = Date.now();
        let creatorsCache = {};
        const lastItemID;
        const creators = [];
        for (const row of rows) {
            if (lastItemID && row.itemID !== lastItemID) {
                // item ID changed; accumulated creators should be assigned to
                // last item ID
                if (creators.length) {
                    creatorsCache[lastItemID] = creators;
                    // restart the creators array for the current item
                    creators = [];
                }
            }
            
            lastItemID = row.itemID;
            
            creators.push({
                lastName: normalizeString(row.lastName),
                firstInitial: row.fieldMode === 0 ? normalizeString(row.firstName).charAt(0) : false
            });
        }
        // Add final item creators
        if (creators.length) {
            creatorsCache[lastItemID] = creators;
        }
        console.log('Builiding creatorsCache with alt 1 took ' + Date.now - start + 'ms');

        // creatorsCache alt2: no need for creator rows to be in order of item ID
        // is it slower because I'm looking up against the cache hash table?
        let start = Date.now()
        let creatorsCache = {};
        for (const row of rows) {
            if (creatorsCache[row.itemID] === undefined) creatorsCache[row.itemID] = [];
            creatorsCache[row.itemID].push(parseCreator(row));
        }
        console.log('Builiding creatorsCache with alt 2 took ' + Date.now - start + 'ms');

        this._creatorsCache = creatorsCache;
    }
}

function compareCreators(aCreators, bCreators) {
    if (!aCreators && !bCreators) {
        return true;
    }

    if (!aCreators || !bCreators) {
        return false;
    }
    
    for (const aCreator of aCreators) {
        aLastName = aCreator.lastName;
        aFirstInitial = aCreator.firstInitial;        
        for (const bCreator of bCreators) {
            bLastName = bCreator.lastName;
            bFirstInitial = bCreator.firstInitial;
            if (aLastName === bLastName && aFirstInitial === bFirstInitial) {
                return true;
            }
        }
    }
    return false;
}

function normalizeString(str) {
    // Make sure we have a string and not an integer
    str = str + "";
    
    if (str === "") {
        return "";
    }
    
    str = Zotero.Utilities.removeDiacritics(str)
        .replace(/[ !-/:-@[-`{-~]+/g, ' ') // Convert (ASCII) punctuation to spaces
        .trim()
        .toLowerCase();
    
    return str;
}

function parseCreator(creator) {
    const lastName = normalizeString(creator.lastName);
    const firstInitial = (
        creator.fieldMode === 0 ? normalizeString(row.firstName).charAt(0) : false
    );
    return { lastName, firstInitial };
}
