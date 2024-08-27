# Cita: a Wikidata addon for Zotero

A [Zotero](http://www.zotero.org/) plugin adding citation metadata support, with back and forth communication to
[WikiData](https://www.wikidata.org/), citation extraction from file attachments, and local citation network visualization.

> **Note:** until [#247](https://github.com/diegodlh/zotero-cita/issues/247) is fixed please change your language setting in Zotero (Edit -> Preference -> Advanced -> Miscellaneous) from `English` to a variant (such as `English (UK)` or `English (Canada)`) for Cita to work correctly!

Initial development of this plugin was supported by a [grant](https://meta.wikimedia.org/wiki/Wikicite/grant/WikiCite_addon_for_Zotero_with_citation_graph_support)
from the Wikimedia Foundation.

## Description

The plugin consists of four separate basic modules:

### Citation metadata support

This module adds citation metadata support to Zotero.
It provides an additional Citations tab where the user can:

- add, edit or remove individual citations;
- run item-wide and citation specific actions, such as syncing citations with WikiData, parsing citations from attachments (not yet supported), etc;
- edit source item's UUIDs, such as DOI, WikiData's QID, and [OpenCitations Corpus](https://opencitations.net/corpus) ID.

Citations metadata are currently saved as a note attachment.

### WikiData communication

This module provides back and forth citation syncing with WikiData, using property
[P2860](https://www.wikidata.org/wiki/Property:P2860) "cites work".

### Local Citation Network visualization

This module allows visualizing how items in a local library connect to each other through citations,
using Tim Wölfle's [Local Citation Network](https://timwoelfle.github.io/Local-Citation-Network/).

### Citation extraction (to be developed)

This module will send file attachments to local or remote citation extraction services
(e.g., [Grobid](https://github.com/kermitt2/grobid), [Scholarcy](http://ref.scholarcy.com/api/)) and
retrieve parsed citations from them.

## Installation

Download the [latest XPI](https://github.com/diegodlh/zotero-cita/releases/latest) and [install](https://www.zotero.org/support/plugins) it in Zotero.

## Quickstart guide

Quickstart guide available at [Wikidata's Cita page](https://www.wikidata.org/wiki/Wikidata:Zotero/Cita).

## Translation

Cita is collaboratively translated at translatewiki.net. Would you like to help translate it to other languages? Join the translation project [here](https://translatewiki.net/wiki/Translating:Cita)!

## Development

1. Download a beta version of Zotero from [here](https://www.zotero.org/support/beta_builds) - these come with the debug tools already enabled so you don't need to build it from source.
2. Install nodejs and npm if you don't already have them (Currently Node v18 and npm v8.1 are the minimum required versions)
3. Clone the source code `git clone https://github.com/diegodlh/zotero-cita`, and run `git submodule update --init --recursive` to fetch the nested submodules.
4. Setup the plugin to run with the debug version of Zotero
    1. Make a new file in the repo root called `.env` (you can also copy an example `.env` file from [here](https://github.com/northword/zotero-plugin-scaffold?tab=readme-ov-file#03-create-a-env-file))
    2. Add a line in `.env` like `ZOTERO_PLUGIN_ZOTERO_BIN_PATH = <path-to-your-zotero-binary>` to point to the executable of the Zotero debug build you downloaded in step 1.
    3. Add a line in `.env` pointing to the Zotero profile you will be using: `ZOTERO_PLUGIN_PROFILE_PATH = <path-to-your-zotero-profile-folder>` (ideally, create a new Zotero profile for debugging). For me the folder is called `3vvlvf75.debug`. Instructions on how to find this folder can be found [here](https://www.zotero.org/support/kb/profile_directory)
5. Run `npm install`
6. This plugin is built using esbuild. Run `npm run start` to launch Zotero and rebuild the plugin automatically each time the source code is changed (thanks to [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold)). For some changes like CSS the hot reloading doesn't work and you will need to restart Zotero. Built files will be saved to `build/addon/chrome/content`.
   1. The firefox debug tools should automatically pop up, allowing you to see console output, debug code, and edit CSS. Most code should be visible under `file://` in the debugger
7. For distribution, run `npm run build`, then you can find the extension at `build/zotero-cita.xpi`.

## Publishing

> **Note:** these instructions are outdated

1. Decide new version number vX.Y.Z using [Semantic Versioning](https://semver.org/).
2. Update version number in:
   - `/package.json`
   - `/static/install.rdf`
     - **Note:** Choose the correct update script in `em:updateURL` depending on beta/full release
3. Update `version` and `updateLink`s in `/update.rdf` or `./update-beta.rdf` (for the beta release).
4. Run `git clean -xdf` to remove untracked files, including `/build` and `/node_modules`.
5. Run `npm install`. This will also update `/package-lock.json` with the new version.
6. Run `npm run build` to build the plugin.
7. Zip the contents of `/build` into a zip file named `zotero-cita-vX.Y.Z.xpi`. E. g. `cd build && zip -r ../zotero-cita-v0.0.1.xpi *`
8. Until integration tests have been implemented (#30), install the new version
on a fresh Zotero profile and run some manual tests.
1. Run `git commit -m "Bump vX.Y.Z"` and `git push`.
2.  Run `git tag vX.Y.Z` and `git push --tags`.
3.  On GitHub, create a new release:
    1.  Choose tag vX.Y.Z.
    2.  Set release title "vX.Y.Z".
    3.  In the description, list changes since last release.
    4.  Attach the xpi file created above.
    5.  Click "Publish release" and hope everything is alright.

## Acknowledgements

Cita depends on:

- maxlath's [wikibase-edit](https://github.com/maxlath/wikibase-edit) & [wikibase-sdk](https://github.com/maxlath/wikibase-sdk)
- Philipp Zumstein's [QuickStatements translator for Zotero](https://github.com/UB-Mannheim/zotkat)
- Tim Wölfle's [Local Citation Network](https://timwoelfle.github.io/Local-Citation-Network/)
- [React](https://reactjs.org/)

Support for importing/exporting citations from/to a file, among other contributions, were mostly implemented by Dominic Dall'Osto.

## License

Copyright (C) 2022 Diego de la Hera, Dominic Dall'Osto, and contributors.

This work is released under the terms of [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) or any later version.

Cita for Zotero 7 was based on windingwind's [zotero plugin template](https://github.com/windingwind/zotero-plugin-template), while previous versions were based on Will Shanks' [Zutilo plugin](https://github.com/willsALMANJ/Zutilo).

Doing anything new in XUL has also been strongly recommended against, and using standard React/HTML has been suggested instead (see [here](https://groups.google.com/g/zotero-dev/c/xYC0I8JaUAI/m/K6utpEnjCgAJ), or [here](https://groups.google.com/g/zotero-dev/c/jxD_1mO1jUY/m/OYSw77LVAAAJ)). For these cases, some inspiration has been borrowed from already reactified components in [Zotero's source code](https://github.com/zotero/zotero/tree/master/chrome/content/zotero/components).
