import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";
import { copyFileSync, readdirSync, renameSync, mkdirSync, cpSync } from "fs";

import fse from "fs-extra";
import { replaceInFileSync } from "zotero-plugin-scaffold/tools";

import tags from "language-tags";

export default defineConfig({
	source: ["src", "static"],
	dist: "build",
	name: pkg.config.addonName,
	id: pkg.config.addonID,
	namespace: pkg.config.addonRef,
	updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/update/${
		pkg.version.includes("-") ? "update-beta.json" : "update.json"
	}`,
	xpiDownloadLink:
		"https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",

	server: {
		asProxy: true,
	},

	build: {
		assets: ["static/**/*.*"],
		define: {
			...pkg.config,
			author: pkg.author,
			description: pkg.description,
			homepage: pkg.homepage,
			buildVersion: pkg.version,
			buildTime: "{{buildTime}}",
		},
		esbuildOptions: [
			{
				entryPoints: [
					"src/index.ts",
					"src/dialogs/editor/index.tsx",
					"src/dialogs/identifier-importer/index.tsx",
					"src/dialogs/citation-importer/index.tsx",
					"src/dialogs/selector/index.tsx",
				],
				define: {
					__env__: `"${process.env.NODE_ENV}"`,
				},
				bundle: true,
				target: "firefox115",
				outdir: "build/addon/chrome/content/scripts",
				sourcemap:
					process.env.NODE_ENV == "development" ? "linked" : false,
			},
		],
		hooks: {
			"build:copyAssets": (ctx) => {
				const localePath = "build/addon/locale/";
				fse.moveSync("build/addon/chrome/locale/", localePath);

				// rename language tags using the correct casing
				// otherwise they are ignored by Zotero
				for (const dirent of readdirSync(localePath, {
					withFileTypes: true,
				})) {
					if (dirent.isDirectory()) {
						const langTag = tags(dirent.name);
						if (langTag.valid()) {
							renameSync(
								localePath + dirent.name,
								localePath + langTag.format(),
							);
						}
					}
				}

				// rename wikicite.properties to addon.ftl
				for (const path of readdirSync(localePath, {
					encoding: "utf-8",
					recursive: true,
				})) {
					if (path.endsWith("wikicite.properties")) {
						renameSync(
							localePath + path,
							localePath +
								path.replace(
									"wikicite.properties",
									"addon.ftl",
								),
						);
					}
				}

				// replace . for _ in message keys
				replaceInFileSync({
					files: localePath + "/**/*.ftl",
					from: /\.(?=.*=)/g,
					to: "_",
				});
				// replace %1$s, %2$s, etc for { $s1 }, { $s2 }
				replaceInFileSync({
					files: localePath + "/**/*.ftl",
					from: /(?<!%)%(\d+)\$\w/g,
					to: "{ $$s$1 }",
				});
				// replace %s for { $s1 }, literally
				replaceInFileSync({
					files: localePath + "/**/*.ftl",
					from: /(?<!%)%\w/g,
					to: "{ $$s1 }",
				});
				// add .label tags for preferences localisation
				replaceInFileSync({
					files: localePath + "/**/*.ftl",
					from: /wikicite_prefs_citation-storage-(note|extra)=/g,
					to: "$&\n    .label=",
				});
				// add .label tag for citation pane label
				replaceInFileSync({
					files: localePath + "/**/*.ftl",
					from: /wikicite_citations-pane_label\s*=/g,
					to: "$&\n    .label =",
				});
				// add .tooltiptext tags for citation pane buttons
				replaceInFileSync({
					files: localePath + "/**/*.ftl",
					from: /wikicite_citations-pane[a-zA-Z\-_]*_tooltiptext\s*=/g,
					to: "$&\n    .tooltiptext =",
				});

				// Copy local citations network
				mkdirSync("build/addon/chrome/content/Local-Citation-Network/");
				copyFileSync(
					"Local-Citation-Network/index.js",
					"build/addon/chrome/content/Local-Citation-Network/index.js",
				);
				copyFileSync(
					"Local-Citation-Network/index.html",
					"build/addon/chrome/content/Local-Citation-Network/index.html",
				);
				cpSync(
					"Local-Citation-Network/lib",
					"build/addon/chrome/content/Local-Citation-Network/lib",
					{ recursive: true },
				);
			},
		},
		// If you want to checkout update.json into the repository, uncomment the following lines:
		// makeUpdateJson: {
		//   hash: false,
		// },
		// hooks: {
		//   "build:makeUpdateJSON": (ctx) => {
		//     copyFileSync("build/update.json", "update.json");
		//     copyFileSync("build/update-beta.json", "update-beta.json");
		//   },
		// },
	},
	// release: {
	//   bumpp: {
	//     execute: "npm run build",
	//   },
	// },

	// If you need to see a more detailed build log, uncomment the following line:
	// logLevel: "trace",
});
