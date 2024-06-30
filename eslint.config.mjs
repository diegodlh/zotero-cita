// @ts-check Let TS check this config file

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: [
			"build/**",
			"dist/**",
			"logs/**",
			"node_modules/**",
			"scripts/",
			"**/*.js",
			"**/*.bak",
		],
	},
	{
		extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
		rules: {
			"@typescript-eslint/ban-ts-comment": [
				"warn",
				{
					"ts-expect-error": "allow-with-description",
					"ts-ignore": "allow-with-description",
					"ts-nocheck": "allow-with-description",
					"ts-check": "allow-with-description",
				},
			],
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-explicit-any": [
				"off",
				{
					ignoreRestArgs: true,
				},
			],
			"@typescript-eslint/no-non-null-assertion": "off",
		},
	},
);

// old config from package.json

// "eslintConfig": {
// 		"env": {
// 			"browser": true,
// 			"es2021": true
// 		},
// 		"root": true,
// 		"extends": [
// 			"eslint:recommended",
// 			"plugin:@typescript-eslint/recommended",
// 			"plugin:@typescript-eslint/eslint-recommended",
// 			"plugin:@typescript-eslint/recommended-requiring-type-checking",
// 			"prettier"
// 		],
// 		"overrides": [],
// 		"parser": "@typescript-eslint/parser",
// 		"parserOptions": {
// 			"ecmaVersion": "latest",
// 			"sourceType": "module",
// 			"project": [
// 				"tsconfig.json"
// 			],
// 			"tsconfigRootDir": "."
// 		},
// 		"plugins": [
// 			"@typescript-eslint"
// 		],
// 		"rules": {
// 			"@typescript-eslint/ban-ts-comment": [
// 				"warn",
// 				{
// 					"ts-expect-error": "allow-with-description",
// 					"ts-ignore": "allow-with-description",
// 					"ts-nocheck": "allow-with-description",
// 					"ts-check": "allow-with-description"
// 				}
// 			],
// 			"@typescript-eslint/no-unused-vars": "off",
// 			"@typescript-eslint/no-explicit-any": [
// 				"off",
// 				{
// 					"ignoreRestArgs": true
// 				}
// 			],
// 			"@typescript-eslint/no-non-null-assertion": "off"
// 		},
// 		"ignorePatterns": [
// 			"**/build/**",
// 			"**/logs/**",
// 			"**/dist/**",
// 			"**/node_modules/**",
// 			"**/scripts/**",
// 			"**/*.js",
// 			"**/*.bak"
// 		]
// 	},
