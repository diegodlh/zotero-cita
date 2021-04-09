'use strict';

/* global Components, Services */
Components.utils.import("resource://gre/modules/Services.jsm");

/* global Zotero */

// Provides an alternative CSL Engine to obtain labels for the citation items
// However, it is very slow so an alternative approach will be used instead
class CiteProc {
    constructor() {
        // Based on Zotero.Style.prototype.getCiteProc()
        this.sys = {
            items: [],
            retrieveItem: function(index) {
                const zoteroItem = this.items[index];
                if (!zoteroItem) {
                    throw new Error();
                }
                if (!zoteroItem.libaryID) {
                    // Fixme: this is just a workaround
                    zoteroItem.libraryID = 1;
                }
                const cslItem = Zotero.Utilities.itemToCSLJSON(zoteroItem);
                cslItem.id = index;
                return cslItem;
            },
            retrieveLocale: function(lang) {
                return Zotero.Cite.Locale.get(lang)
            }
        }
        this.cslEngine = new Zotero.CiteProc.CSL.Engine(
            this.sys,
            Zotero.File.getContentsFromURL('chrome://wikicite/content/apa.csl'),
            Zotero.locale,
            false
        );
    }
}

/**
 * Wikicite namespace.
 */
export default {
    // /********************************************/
    // // Basic information
    // /********************************************/
    // id: 'zotero-wikicite@wikidata.or',
    // zoteroID: 'zotero@chnm.gmu.edu',
    // zoteroTabURL: 'chrome://zotero/content/tab.xul',

    _bundle: Services.strings.
        createBundle('chrome://wikicite/locale/wikicite.properties'),

    // citeproc: new CiteProc('http://www.zotero.org/styles/apa'),

    /********************************************/
    // General use utility functions
    /********************************************/

    // Fixme: check how to write correct JSDoc
    /**
     * Return values for extra field fields.
     * @param {Zotero.Item} item - A Zotero item.
     * @param {string} fieldName - The extra field field name desired.
     * @returns {extra} extra - Extra field after desired extra field fields have been extracted.
     * @returns {values} values - Array of values for the desired extra field field.
     */
    getExtraField: function(item, fieldName) {
        const extra = item.getField('extra');
        const lines = extra.split(/\n/g);
        const values = []
        const newExtra = lines.filter((line) => {
            let match = line.match(`^${fieldName}:(.+)$`, 'i');
            if (!match) {
                return true;
            }
            let [, value] = match;
            values.push(value.trim());
            return false;
        }).join('\n');
        return {
            newExtra,
            values
        }
    },

    /**
     * Set field value in extra field item.
     * It sets: therefore, if already exists, replaces
     * @param {Zotero.Item} item - A Zotero item.
     * @param {string} fieldName - The name of the extra field that wants to be set.
     * @param {String[]} values - An array of values for the field that wants to be set.
     */
    setExtraField: function(item, fieldName, values) {
        if (!Array.isArray(values)) {
            values = [values];
        }
        let { newExtra } = this.getExtraField(item, fieldName);
        for (let value of values) {
            if (value) {
                // I have to be very careful that there are no new lines in what I'm saving
                newExtra += `\n${fieldName}: ${value.trim()}`;
            }
        }
        item.setField('extra', newExtra);
    },

    /*
     * Return Citations note
     */
    getCitationsNote: function(item) {
        // Fixme: consider moving to SourceItemWrapper
        const notes = Zotero.Items.get(item.getNotes()).filter(
            (note) => note.getNoteTitle() === 'Citations'
        );
        if (notes.length > 1) {
            Services.prompt.alert(
                window,
                Wikicite.getString('wikicite.global.name'),
                Wikicite.getString('wikicite.source-item.get-citations-note.error.multiple')
            );
        }
        return notes[0];
    },

    getString: function(name) {
        // convert camelCase to hyphen-divided for translatewiki.net
        name = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()
        const nameParts = name.split('.');
        // if leading part of the name is not 'wikicite', add it
        if (nameParts[0] !== 'wikicite') nameParts.unshift('wikicite');
        name = nameParts.join('.');
        try {
            return this._bundle.GetStringFromName(name);
        } catch {
            throw Error('Failed getting string from name ' + name);
        }
    },

    formatString: function(name, params) {
        if (!Array.isArray(params)) params = [params];
        // convert camelCase to hyphen-divided for translatewiki.net
        name = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()
        const nameParts = name.split('.');
        // if leading part of the name is not 'wikicite', add it
        if (nameParts[0] !== 'wikicite') nameParts.unshift('wikicite');
        name = nameParts.join('.');
        try {
            return this._bundle.formatStringFromName(name, params, params.length);
        } catch {
            throw Error('Failed formatting string from name ' + name);
        }
    }

    // // Return citation and bibliography labels for list of items provided
    // getItemLabels: function(items) {
    //     // This method is nice, but slow
    //     this.citeproc.sys.items = items;
    //     const indices = [...Array(items.length).keys()]
    //     // defined citable items
    //     const t0 = performance.now();
    //     this.citeproc.cslEngine.updateItems(indices);
    //     const t1 = performance.now();
    //     console.log(`Updating items in the CSL engine took  ${t1-t0}ms.`)
    //     const citation = {
    //         citationItems: indices.map((index) => ({id: index})),
    //         properties: {}
    //     };
    //     // find better citeproc function!
    //     const t2 = performance.now();
    //     const shortLabels = this.citeproc.cslEngine.previewCitationCluster(citation, [], [], 'text').split(';');
    //     const t3 = performance.now();
    //     console.log(`Getting short labels from the CSL engine took  ${t3-t2}ms.`)
    //     const longLabels = items.map(() => 'Long label will be shown here');
    //     return { short: shortLabels, long: longLabels };
    // }
}
