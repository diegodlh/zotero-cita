import { config } from "../../package.json";

export { initLocale, getString, getLocaleID };

/**
 * Initialize locale data
 */
function initLocale() {
	// as seen in https://www.zotero.org/support/dev/zotero_7_for_developers#replacing_properties_files
	// do we "really need to generate a localized string completely outside the
	// context of a window"?
	const l10n = new (
		typeof Localization === "undefined"
			? ztoolkit.getGlobal("Localization")
			: Localization
	// using the Localization interface synchronously by passing true as the
	// second parameter to the constructor, though "strongly discouraged by
	// Mozilla"
	)([`${config.addonRef}-addon.ftl`], true);
	addon.data.locale = {
		current: l10n,
	};
	
	// Zotero 7 automatically registers Fluent sources for enabled plugins
	// found in [plugin-root]/locale/{locale}/
	// See https://www.zotero.org/support/dev/zotero_7_for_developers#registering_fluent_files
	// This is handled by function Zotero.Plugins.registerLocales() in
	// chrome://zotero/content/xpcom/plugins.js
	// However, because of this function's implementation, only exact matches of
	// locales supported by Zotero (as listed by
	// Services.locale.availableLocales) are registered. This results in, for
	// example, our locale "es" not being registered because Zotero supports
	// "es-ES" instead. See https://groups.google.com/g/zotero-dev/c/GUovOSrtQy4
	// The code below removes the source registered by the registerLocales()
	// function and replaces it with one that includes all locales supported by
	// us. This results in:
	//   * Our locale "es" will be used even if requested locale is "es-ES",
	//   * Our locale "pt-BR" will be used even if reqeusted locel is "pt-PT",
	//   * Locales not supported by Zotero but supported by us (such as kaa)
	//     will be used if requested, even if the rest of the interface falls
	//     back to English.
	// TODO: Consider moving this code to bootstrap.js.

	ztoolkit.getGlobal("L10nRegistry").getInstance().removeSources([config.addonID]);

	let source = new (ztoolkit.getGlobal("L10nFileSource"))(
		config.addonID,
		'app',
		[
			// List of locales supported by us
			// TODO: consider picking this up from manifest.json, maybe using
			// "l10n_resources" property, as used in Zotero's
			// resource://gre/modules/Extension.sys.mjs
			"ar",
			"ca",
			"de",
			"en-US",
			"es",
			"fa",
			"fi",
			"fr",
			"gl",
			"he",
			"hi",
			"id",
			"io",
			"it",
			"kaa",
			"ko",
			"lt",
			"mk",
			"nl",
			"pms",
			"pt-br",
			// qqq,
			"ro",
			"ru",
			"sk",
			"sl",
			"sv",
			"tk",
			"tr",
			"uk",
			"zh-hans",
			"zh-hant"
		],
		rootURI + 'locale/{locale}/'
	);
	
	ztoolkit.getGlobal("L10nRegistry").getInstance().registerSources([source]);
}

/**
 * Get locale string, see https://firefox-source-docs.mozilla.org/l10n/fluent/tutorial.html#fluent-translation-list-ftl
 * @param localString ftl key
 * @param options.branch branch name
 * @param options.args args
 * @example
 * ```ftl
 * # addon.ftl
 * addon-static-example = This is default branch!
 *     .branch-example = This is a branch under addon-static-example!
 * addon-dynamic-example =
    { $count ->
        [one] I have { $count } apple
       *[other] I have { $count } apples
    }
 * ```
 * ```js
 * getString("addon-static-example"); // This is default branch!
 * getString("addon-static-example", { branch: "branch-example" }); // This is a branch under addon-static-example!
 * getString("addon-dynamic-example", { args: { count: 1 } }); // I have 1 apple
 * getString("addon-dynamic-example", { args: { count: 2 } }); // I have 2 apples
 * ```
 */
function getString(localString: string): string;
function getString(localString: string, branch: string): string;
function getString(
	localeString: string,
	options: { branch?: string | undefined; args?: Record<string, unknown> },
): string;
function getString(...inputs: any[]) {
	if (inputs.length === 1) {
		return _getString(inputs[0]);
	} else if (inputs.length === 2) {
		if (typeof inputs[1] === "string") {
			return _getString(inputs[0], { branch: inputs[1] });
		} else {
			return _getString(inputs[0], inputs[1]);
		}
	} else {
		throw new Error("Invalid arguments");
	}
}

function _getString(
	localeString: string,
	options: {
		branch?: string | undefined;
		args?: Record<string, unknown>;
	} = {},
): string {
	const localStringWithPrefix = `${config.addonRef}-${localeString}`;
	const { branch, args } = options;
	const pattern = addon.data.locale?.current.formatMessagesSync([
		{ id: localStringWithPrefix, args },
	])[0];
	if (!pattern) {
		return localStringWithPrefix;
	}
	if (branch && pattern.attributes) {
		for (const attr of pattern.attributes) {
			if (attr.name === branch) {
				return attr.value;
			}
		}
		return pattern.attributes[branch] || localStringWithPrefix;
	} else {
		return pattern.value || localStringWithPrefix;
	}
}

function getLocaleID(id: string) {
	return `${config.addonRef}-${id}`;
}
