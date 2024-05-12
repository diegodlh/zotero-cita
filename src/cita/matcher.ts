import Wikicite, { debug } from './wikicite';

declare const Zotero: any;

// Widely based on Zotero.Duplicates._findDuplicates
export default class Matcher {
    _libraryID: number;
    _scopeIDs: any;
    _isbnCache: any;
    _isbnMap: any;
    _doiCache: any;
    _doiMap: any;
    _qidCache: any;
    _qidMap: any;
    _titleMap: any;
    _creatorsCache: any;
    _yearCache: any;
    /**
     * Create a Matcher
     * @param {Number} libraryID Target library ID
     * @param {Array} [scopeIDs] Array of item IDs to limit matches to
     */
    constructor(libraryID, scopeIDs?) {
        if (!Zotero.Libraries.exists(libraryID)) {
            throw new Error('Invalid library ID');
        }
        this._libraryID = libraryID;
        this._scopeIDs = scopeIDs;
    }

    async init() {
        debug('Initializing Matcher');
        const start = Date.now();

        await Promise.all([
            this._getISBNs(),
            this._getDOIs(),
            this._getQIDs(),
            this._getYears(),
            this._getTitles(),
            this._getCreators()
            // new Promise((resolve) => setTimeout(() => {resolve()}, 1000))
        ]);

        debug(
            `Matcher took ${Date.now() - start}ms to initialize ` +
            `for ${Object.keys(this._yearCache).length} items`
        );
    }
    // fix: disabled this
    // _yearCache(_yearCache: any) {
    //     throw new Error('Method not implemented.');
    // }

    findMatches(item) {
        if (
            !this._isbnCache || !this._isbnMap ||
            !this._doiCache || !this._doiMap ||
            !this._qidCache || !this._qidMap ||
            !this._yearCache ||
            !this._titleMap ||
            !this._creatorsCache
        ) throw new Error("Matches hasn't been initialized yet");

        debug("Finding matching Zotero items");
        const start = Date.now();

        // ISBN
        const isbn = Zotero.Utilities.cleanISBN(String(item.getField('ISBN')));
        const isbnMatches = this._isbnMap[isbn] ?? [];

        // DOI
        const doi = (Zotero.Utilities.cleanDOI(String(item.getField('DOI'))) ?? '')
            .toUpperCase();
        const doiMatches = this._doiMap[doi] ?? [];

        // QID
        const qid = (Wikicite.getExtraField(item, 'qid').values[0] ?? '')
            .toUpperCase();
        const qidMatches = this._qidMap[qid] ?? [];

        // title
        const title = normalizeString(item.getField('title', undefined, true));
        const year = item.getField('year');
        const creators = item.getCreators().map((creator) => parseCreator(creator));

        const titleMatches = [];
        for (const candidate of this._titleMap[title] ?? []) {
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

        const matches = [...new Set(
            [].concat(isbnMatches, doiMatches, qidMatches, titleMatches))
        ].sort((a, b) => a-b);
        debug("Found matches in " + (Date.now() - start) + " ms");

        return matches;
    }

    async _getISBNs() {
        // Match books by ISBN
        // ISBNs are supported by item types other than books,
        // but they are types such as bookSection or conferencePaper,
        // probably referring to the book they belong to.
        // Hence, two bookSections or conferencePapers, for example,
        // may have the same ISBN
        let sql = "SELECT itemID, value FROM items JOIN itemData USING (itemID) " +
            "JOIN itemDataValues USING (valueID) " +
            "WHERE libraryID=? AND itemTypeID=? AND fieldID=? " +
            "AND itemID NOT IN (SELECT itemID FROM deletedItems)";
        if (this._scopeIDs) {
            sql += " AND itemID IN (" + this._scopeIDs.join(', ') + ")";
        }
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
            const newVal = Zotero.Utilities.cleanISBN(String(row.value));
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
        let sql = "SELECT itemID, value FROM items JOIN itemData USING (itemID) " +
            "JOIN itemDataValues USING (valueID) " +
            "WHERE libraryID=? AND fieldID=? AND value LIKE ? " +
            "AND itemID NOT IN (SELECT itemID FROM deletedItems)";
        if (this._scopeIDs) {
            sql += " AND itemID IN (" + this._scopeIDs.join(', ') + ")";
        }
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
            const newVal = (Zotero.Utilities.cleanDOI(String(row.value)) ?? '')
                .toUpperCase();
            if (!newVal) continue;
            doiCache[row.itemID] = newVal;
            if (doiMap[newVal] === undefined) doiMap[newVal] = [];
            doiMap[newVal].push(row.itemID);
        }
        this._doiCache = doiCache;
        this._doiMap = doiMap;
    }

    async _getQIDs() {
        // QID
        let sql = "SELECT itemID, value FROM items JOIN itemData USING (itemID) " +
            "JOIN itemDataValues USING (valueID) " +
            "WHERE libraryID=? AND fieldID=? " +
            "AND itemID NOT IN (SELECT itemID FROM deletedItems)";
        if (this._scopeIDs) {
            sql += " AND itemID IN (" + this._scopeIDs.join(', ') + ")";
        }
        const rows = await Zotero.DB.queryAsync(
            sql,
            [
                this._libraryID,
                Zotero.ItemFields.getID('extra')
            ]
        );
        const qidCache = {};
        const qidMap = {};
        for (const row of rows) {
            // keep first QID only
            const match = row.value.match(/^qid:\s*(q\d+)$/im);
            if (!match) continue;
            const newVal = match[1].toUpperCase();
            qidCache[row.itemID] = newVal;
            if (qidMap[newVal] === undefined) qidMap[newVal] = [];
            qidMap[newVal].push(row.itemID);
        }
        this._qidCache = qidCache;
        this._qidMap = qidMap;
    }

    async _getYears() {
        // Get years
        const dateFields = [Zotero.ItemFields.getID('date')].concat(
            Zotero.ItemFields.getTypeFieldsFromBase('date')
        );
        let sql = "SELECT itemID, SUBSTR(value, 1, 4) AS year FROM items " +
            "JOIN itemData USING (itemID) " +
            "JOIN itemDataValues USING (valueID) " +
            "WHERE libraryID=? AND fieldID IN (" +
            dateFields.map(() => '?').join() + ") " +
            "AND SUBSTR(value, 1, 4) != '0000' " +
            "AND itemID NOT IN (SELECT itemID FROM deletedItems)";
        if (this._scopeIDs) {
            sql += " AND itemID IN (" + this._scopeIDs.join(', ') + ")";
        }
        const rows = await Zotero.DB.queryAsync(sql, [this._libraryID].concat(dateFields));
        const yearCache = {};
        for (const row of rows) {
            yearCache[row.itemID] = row.year;
        }
        this._yearCache = yearCache;
    }

    async _getTitles() {
        // Match on normalized title
        const itemTypeAttachment = Zotero.ItemTypes.getID('attachment');
        const itemTypeNote = Zotero.ItemTypes.getID('note');

        const titleIDs = Zotero.ItemFields.getTypeFieldsFromBase('title');
        titleIDs.push(Zotero.ItemFields.getID('title'));
        let sql = "SELECT itemID, value FROM items JOIN itemData USING (itemID) " +
            "JOIN itemDataValues USING (valueID) " +
            "WHERE libraryID=? AND fieldID IN " +
            "(" + titleIDs.join(', ') + ") " +
            `AND itemTypeID NOT IN (${itemTypeAttachment}, ${itemTypeNote}) ` +
            "AND itemID NOT IN (SELECT itemID FROM deletedItems)";
        if (this._scopeIDs) {
            sql += " AND itemID IN (" + this._scopeIDs.join(', ') + ")";
        }
        const rows = await Zotero.DB.queryAsync(sql, [this._libraryID]);
        const titleMap = {};
        for (const row of rows) {
            const newVal = normalizeString(row.value);
            if (!newVal) continue;
            if (titleMap[newVal] === undefined) titleMap[newVal] = [];
            titleMap[newVal].push(row.itemID);
        }
        this._titleMap = titleMap;
    }

    async _getCreators() {
        // Get all creators and separate by itemID
        const itemTypeAttachment = Zotero.ItemTypes.getID('attachment');
        const itemTypeNote = Zotero.ItemTypes.getID('note');

        let sql = "SELECT itemID, lastName, firstName, fieldMode FROM items " +
            "JOIN itemCreators USING (itemID) " +
            "JOIN creators USING (creatorID) " +
            `WHERE libraryID=? AND itemTypeID NOT IN (${itemTypeAttachment}, ${itemTypeNote}) AND ` +
            "itemID NOT IN (SELECT itemID FROM deletedItems)";
        if (this._scopeIDs) {
            sql += " AND itemID IN (" + this._scopeIDs.join(', ') + ")";
        }
        // sql += " ORDER BY itemID, orderIndex";
        const rows = await Zotero.DB.queryAsync(sql, this._libraryID);

        let creatorsCache = {};
        for (const row of rows) {
            if (creatorsCache[row.itemID] === undefined) creatorsCache[row.itemID] = [];
            creatorsCache[row.itemID].push(parseCreator(row));
        }

        // Alternative slightly faster method that pushes creators to a temporary
        // creators array until the item ID changes. Needs rows be sorted by item ID.
        // let lastItemID;
        // let creators = [];
        // for (const row of rows) {
        //     if (lastItemID && row.itemID !== lastItemID) {
        //         // item ID changed; accumulated creators should be assigned to
        //         // last item ID
        //         if (creators.length) {
        //             creatorsCache[lastItemID] = creators;
        //             // restart the creators array for the current item
        //             creators = [];
        //         }
        //     }

        //     lastItemID = row.itemID;

        //     creators.push({
        //         lastName: normalizeString(row.lastName),
        //         firstInitial: row.fieldMode === 0 ? normalizeString(row.firstName).charAt(0) : false
        //     });
        // }
        // // Add final item creators
        // if (creators.length) {
        //     creatorsCache[lastItemID] = creators;
        // }

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
        const aLastName = aCreator.lastName;
        const aFirstInitial = aCreator.firstInitial;
        for (const bCreator of bCreators) {
            const bLastName = bCreator.lastName;
            const bFirstInitial = bCreator.firstInitial;
            if (aLastName === bLastName && aFirstInitial === bFirstInitial) {
                return true;
            }
        }
    }
    return false;
}

function normalizeString(str) {
    // Make sure we have a string and not an integer
    str = String(str);

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
        creator.fieldMode === 0 ? normalizeString(creator.firstName).charAt(0) : false
    );
    return { lastName, firstInitial };
}
