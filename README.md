# WikiCite plugin for Zotero
A [Zotero](http://www.zotero.org/) plugin adding citation metadata support, with back and forth communication to
[WikiData](https://www.wikidata.org/), citation extraction from file attachments, and local citation network visualization.

Development of this plugin is supported by a [grant](https://meta.wikimedia.org/wiki/Wikicite/grant/WikiCite_addon_for_Zotero_with_citation_graph_support)
from the Wikimedia Foundation.

**WARNING: THIS PLUGIN IS IN AN EARLY DEVELOPMENT PHASE AND MAY BREAK YOUR LIBRARY!**
This plugin is under development and there is still much work to do and bugs to fix.
Feel free to try it, but please use a [separate Zotero profile](https://www.zotero.org/support/kb/multiple_profiles)
or [back up your database](https://www.zotero.org/support/zotero_data#backing_up_your_zotero_data) before proceeding.

## Description
The plugin consists of four separate basic modules:

#### Citation metadata support

This module adds citation metadata support to Zotero.
It provides an additional Citations tab where the user can:

- add, edit or remove individual citations;
- run item-wide and citation specific actions, such as syncing to WikiData, parsing citations from attachments, etc;
- edit source item's UUIDs, such as DOI, WikiData's QID, and [OpenCitations Corpus](https://opencitations.net/corpus) ID.

Citation metadata are currently saved to the source item's "extra" field, but it is [planned](https://github.com/diegodlh/zotero-wikicite/issues/13)
to move them to Note attachments.

#### WikiData communication (partial)
This module will add back and forth citation syncing to WikiData, using property
[P2860](https://www.wikidata.org/wiki/Property:P2860) "cites work".
Uploading support to be developed.

#### Local Citation Network visualization (to be developed)
This module will allow visualizing how items in a local library connect to each other through citations,
using Tim Wölfle's [Local Citation Network](https://timwoelfle.github.io/Local-Citation-Network/).

#### Citation extraction (to be developed)
This module will send file attachments to local or remote citation extraction services
(e.g., [Grobid](https://github.com/kermitt2/grobid), [Scholarcy](http://ref.scholarcy.com/api/)) and
retrieve parsed citations from them.

## Installation
**WARNING: THIS PLUGIN IS IN AN EARLY DEVELOPMENT PHASE AND MAY BREAK YOUR LIBRARY!**
Feel free to try it, but please use a [separate Zotero profile](https://www.zotero.org/support/kb/multiple_profiles) or
[back up your database](https://www.zotero.org/support/zotero_data#backing_up_your_zotero_data) before proceeding.

Download the [latest XPI](https://github.com/diegodlh/zotero-wikicite/releases/latest) and [install](https://www.zotero.org/support/plugins) it in Zotero.

## Development
1. Clone the source code, and run `git submodule update --init --recursive` to fetch the nested submodules.
2. Run `npm install`
3. This plugin is built using Webpack and Babel. Run `npm run build`, or `npm run watch` to rebuild
automatically each time the source code is changed. Built files will be saved to `dist/chrome/content`.
4. Follow the steps [here](https://www.zotero.org/support/dev/client_coding/plugin_development#setting_up_a_plugin_development_environment)
to have Zotero run the plugin directly from the `dist` directory.
5. Start Zotero with these recommended flags:
	- `-p <Profile>`: runs Zotero with a custom development profile to avoid breaking your personal library
	- `-purgecaches`: forces Zotero to re-read any cached files
	- `-ZoteroDebugText`: prints the debug output to the terminal window
	- `-jsconsole`: opens a basic JavaScript debug console; this is not necessary if you be debugging
	using your browser (see below), but it may help you detect early errors without having to open
	the developer tools
6. For distribution, pack the contents of the `dist` directory into a ZIP file and change its extension to `.xpi`.

### Debugging
To debug, you need to build Zotero with debugging support. Follow the instructions
[here](https://www.zotero.org/support/dev/client_coding/building_the_standalone_client) to:

1. Clone Zotero source code and scripts.
2. Build the Zotero client. See [1] below
3. Build the Zotero standalone client with the `-t` option.
4. Run Zotero with the `-debugger` flag: `staging/Zotero_linux-x86_64/zotero -debugger ...`. This runs the Mozilla DevTools server
on port 6100, which you can connect to from Firefox Developer Tools.
5. Download and use a Firefox version compatible with the Firefox version used by Zotero. For example, Zotero 5.0.94
is based on [Firefox 60.9.0esr](https://ftp.mozilla.org/pub/firefox/releases/60.9.0esr/). See [2] below
6. Run the Firefox version you downloaded using the `--new-instance` flag in case you have another Firefox
instance running, and the `-p <Profile>` flag to use a separate profile for this version.
6. Open Firefox Developer Tools and connect to port 6100 for remote debugging. See [3] below

[1] Before building, making these changes to the Zotero source code might help you with debugging:

- If your browser developer tools are failing to retrieve the source maps for the compiled Zotero files,
try using inline source maps instead. To do this, add a `sourceMaps: "inline"` key:value pair to the `.babelrc`
configuration file.
- Zotero has a notification system such that observers can be registered to be notified when certain
events occur, such as when an item is modified. However, this notification system is [not thoroughly
documented](https://github.com/zotero/zotero/issues/1310). To log a message to the Zotero debug output each time
a notification is triggered, uncomment the two calls to `Zotero.debug()` that you will find in the 
`Zotero.Notifier.trigger` function inside `chrome/content/zotero/xpcom/notifier.js`. Make sure you are running
Zotero with the `-ZoteroDebugText` flag (see previous section).

[2] To prevent your downloaded Firefox version from upgrading to a newer version, you
have to disable automatic updates:

1. Run your system's Firefox version from the command line with the `-P` flag to open the Profile Manager.
2. Create a new profile that you will use with the Firefox version you downloaded.
3. Click  on 'Start Firefox' to start your system Firefox using the profile you have just created.
4. Go to `about:config` and set `app.udpate.auto` to `false`.
5. Close your system Firefox.
6. Run the Firefox version you downloaded using the `-P <ProfileName>` flag.

The reason why the setting must be changed using your system Firefox is because it seems that Firefox
checks for updates on startup, before one can change the setting. And if an update is found,
it will be applied on next start, irrespective of this setting's value, overwriting the version you
downloaded.

[3] Unfortunately the developer tools are closed automatically when the Zotero client is closed. Therefore,
each time a change is made to the plugin, the Zotero client must be restarted, and the developer tools
have to be opened again. If someone knows of a way to prevent developer tools from closing and reconnect
when connection is available again, or to have them open automatically via console, so it can be run
immediately after Zotero, please let me know!

## Third-party software

The Wikicite plugin for Zotero depends on:
- maxlath's [wikibase-edit](https://github.com/maxlath/wikibase-edit) & [wikibase-sdk](https://github.com/maxlath/wikibase-sdk)
- Philipp Zumstein's [QuickStatements translator for Zotero](https://github.com/UB-Mannheim/zotkat)
- [React](https://reactjs.org/)

## License

Copyright (C) 2021 Diego de la Hera.

This work is released under the terms of [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) or any later version.

It has been [suggested](https://forums.zotero.org/discussion/comment/345799/#Comment_345799) that new
Zotero plugins be written as
[bootstrapped extensions](https://developer.mozilla.org/en-US/docs/Archive/Add-ons/How_to_convert_an_overlay_extension_to_restartless)
rather than XUL overlay extensions, to facilitate them being ported to a future non-Mozilla version of Zotero.
As [suggested](https://groups.google.com/g/zotero-dev/c/wLZdrPiaKeA/m/PVgi8S93CgAJ) elsewhere, Will Shanks'
[Zutilo plugin](https://github.com/willsALMANJ/Zutilo) was used as an example of an existing bootstrapped
extension to write some parts of this plugin.

Doing anything new in XUL has also been strongly recommended against, and using standard React/HTML has been
suggested instead (see [here](https://groups.google.com/g/zotero-dev/c/xYC0I8JaUAI/m/K6utpEnjCgAJ),
or [here](https://groups.google.com/g/zotero-dev/c/jxD_1mO1jUY/m/OYSw77LVAAAJ)). For these cases,
some inspiration has been borrowed from already reactified components in
[Zotero's source code](https://github.com/zotero/zotero/tree/master/chrome/content/zotero/components).
