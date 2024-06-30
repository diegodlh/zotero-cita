import Citations from "./citations";
import Wikicite from "./wikicite";
import WikiciteChrome from "./wikiciteChrome";
import Wikidata from "./wikidata";
import zoteroOverlay from "./zoteroOverlay";
/* global window */

// window.Wikicite = Wikicite;

// Fixme: now I'm working with modules, do I still need to have these
// namespaces on the `window` object? Can use imports instead?
// window.Wikicite.Citations = Citations;
// window.Wikicite.Wikidata = Wikidata;

window.WikiciteChrome = WikiciteChrome;
window.WikiciteChrome.zoteroOverlay = zoteroOverlay;
