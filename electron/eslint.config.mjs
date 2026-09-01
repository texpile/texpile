import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import globals from 'globals';
import ts from 'typescript-eslint';

// the main process's mirror of apps/texpile-editor/eslint.config.js: same styles.md rule set,
// minus everything svelte/browser (this tree is plain node + electron main)
export default ts.config(
	{ ignores: ['dist/**', 'lua/**'] },
	js.configs.recommended,
	...ts.configs.recommended,
	prettier,
	{
		languageOptions: {
			globals: { ...globals.node },
			parserOptions: { tsconfigRootDir: import.meta.dirname }
		},
		rules: {
			'no-useless-assignment': 'warn',
			'preserve-caught-error': 'warn',
			// underscore prefix = intentionally unused
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_'
				}
			]
		}
	},
	{
		files: ['src/**'],
		rules: {
			'func-style': ['warn', 'declaration'],
			'no-param-reassign': ['warn', { props: true }],
			'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
			'id-length': ['error', { min: 1, max: 50 }],
			// no 'data', unlike the renderer's list: here it is the wire field name (node-pty's onData,
			// websocket message.data, the preload channel payloads) and cannot rename
			'id-denylist': ['warn', 'info', 'obj', 'tmp', 'temp', 'misc', 'thing', 'val', 'arr', 'foo', 'helper', 'helpers', 'util', 'utils'],
			'@typescript-eslint/consistent-type-definitions': ['warn', 'type'],
			'no-restricted-exports': ['warn', { restrictDefaultExports: { direct: true, named: true } }]
		}
	},
	{
		files: ['src/**/*.ts'],
		rules: {
			'@typescript-eslint/naming-convention': [
				'warn',
				{ selector: 'import', format: null },
				// object keys often mirror external shapes (HTTP headers, IPC payloads, wire formats)
				{ selector: 'objectLiteralProperty', format: null },
				{ selector: 'typeProperty', format: null },
				{ selector: 'variable', modifiers: ['destructured'], format: null },
				{
					selector: 'variable',
					format: ['strictCamelCase', 'StrictPascalCase', 'UPPER_CASE'],
					leadingUnderscore: 'allowDouble',
					trailingUnderscore: 'allowDouble'
				},
				{ selector: 'function', format: ['strictCamelCase'] },
				{ selector: 'parameter', format: ['strictCamelCase'], leadingUnderscore: 'allow' },
				{ selector: 'classProperty', format: ['strictCamelCase', 'UPPER_CASE'], leadingUnderscore: 'allow' },
				{ selector: 'classMethod', format: ['strictCamelCase'] },
				{ selector: 'enumMember', format: ['UPPER_CASE'] },
				{ selector: 'interface', format: ['StrictPascalCase'], custom: { regex: '^I[A-Z]', match: false } },
				{ selector: 'class', format: ['StrictPascalCase'], custom: { regex: '^Abstract', match: false } },
				{ selector: 'typeLike', format: ['StrictPascalCase'] }
			]
		}
	}
);
