import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";
import { copyFileSync } from "fs";
import path from "path";

export default defineConfig({
	source: ["src", "static"],
	dist: "build",
	name: pkg.config.addonName,
	id: pkg.config.addonID,
	namespace: pkg.config.addonRef,
	updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/release/${
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
