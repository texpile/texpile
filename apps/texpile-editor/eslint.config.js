import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

const restrictedImportPaths = [{ name: 'svelte/store', message: 'runes only; adapt a third-party store at the edge (styles.md)' }];

const banPackageData = {
	group: ['**/knowledge/data', '**/knowledge/data/**'],
	message: 'the package data has one reader per language: import what you need from languages/latex/knowledge or languages/typst/knowledge'
};

// the disk client has one caller; everything else reads and writes through lib/files/service/fileService
const banDiskAccess = {
	group: ['**/fileSystem', '$lib/workspace/fileSystem'],
	importNames: [
		'scanTexFiles',
		'scanFiles',
		'scanTree',
		'scanTreeAndFiles',
		'createEntry',
		'deleteEntry',
		'renameEntry',
		'copyEntry',
		'trashEntry',
		'restoreEntry',
		'readTextFile',
		'readSourceFile',
		'resolveRealRelative',
		'probeFile',
		'writeTextFile',
		'writeBinaryFile',
		'statFile',
		'searchInFolder',
		'fileUrl',
		'formatLatexDocument'
	],
	message: 'go through fileService (lib/files/service/fileService.ts); only diskProvider talks to the disk client'
};

const PROVIDER_IO =
	'/^(readText|readSource|readBytes|probe|scanTree|scanTexFiles|scanTreeAndFiles|scanFiles|stat|fileUrl|writeText|writeBinary|create|remove|rename|copy|trash|restore|search|format|realRelative)$/';

// package-private folders: internals are importable only through the package's entry file
const packagePrivatePatterns = [
	{
		group: ['$lib/languages/latex/visual/plugins/**'],
		message: 'a LaTeX plugin is reached through latexPlugins.ts and latexDocumentPlugins.ts, never directly'
	},
	{
		group: ['$lib/languages/typst/visual/plugins/**'],
		message: 'a Typst plugin is reached through typstPlugins.ts and typstDocumentPlugins.ts, never directly'
	},
	{
		group: ['$lib/languages/markdown/visual/plugins/**'],
		message: 'a Markdown plugin is reached through markdownPlugins.ts, never directly'
	},
	{
		group: ['**/languages/latex/schema/*', '!**/languages/latex/schema/latexPMSchema'],
		message: 'latexPMSchema internals are package-private; import through latexPMSchema.ts'
	},
	{
		group: ['**/languages/bib/*', '!**/languages/bib/biblatex', '!**/languages/bib/bibtexLanguage'],
		message: 'bib internals are package-private; import through biblatex.ts or bibtexLanguage.ts'
	},
	{
		group: ['**/editor/visual/schema/*', '!**/editor/visual/schema/basePMSchema'],
		message: 'base schema internals are package-private; import through basePMSchema.ts'
	},
	// one reading of LaTeX source: the Lezer tree in languages/latex/syntax
	{ group: ['@unified-latex/*'], message: 'LaTeX is read off the Lezer tree (languages/latex/syntax)' },
	banPackageData,
	banDiskAccess
];

// a language never imports a sibling language; shared code lives in editor/, with no exceptions
function languageBoundary(bans) {
	return {
		'no-restricted-imports': ['error', { paths: restrictedImportPaths, patterns: [...packagePrivatePatterns, ...bans, banDesktopOnly] }]
	};
}
// a negation cannot re-include a file whose parent directory another pattern excluded (gitignore
// semantics), so subfolders are listed one by one and root files by name - a new root file or
// subfolder must be added here to stay fenced
const banLatex = {
	group: [
		'**/languages/latex/log/**',
		'**/languages/latex/parser/**',
		'**/languages/latex/serializer/**',
		'**/languages/latex/source/**',
		'**/languages/latex/visual/**',
		'**/languages/latex/intellisense/**',
		'**/languages/latex/schema/**',
		'**/languages/latex/symbols/**'
	],
	message: 'cross-language import; shared code belongs in editor/ (styles.md)'
};
const banTypst = {
	group: [
		'**/languages/typst/logParser',
		'**/languages/typst/filerefs',
		'**/languages/typst/projectFiles',
		'**/languages/typst/intellisense/**',
		'**/languages/typst/preview/**',
		'**/languages/typst/source/**',
		'**/languages/typst/symbols/**',
		'**/languages/typst/export/**',
		'**/languages/typst/visual/**'
	],
	message: 'cross-language import; shared code belongs in editor/ (styles.md)'
};
const banMarkdown = { group: ['**/languages/markdown/**'], message: 'cross-language import; shared code belongs in editor/ (styles.md)' };
const banAll = [
	// biblatex's data model and what TeX prints are package data, so bib reads latex/knowledge
	{
		group: [
			'**/languages/latex/*',
			'!**/languages/latex/knowledge',
			'../latex/*',
			'!../latex/knowledge',
			'../../latex/*',
			'!../../latex/knowledge'
		],
		message: 'bib is a dependency of the other languages, never the reverse'
	},
	{ group: ['**/languages/typst/**'], message: 'bib is a dependency of the other languages, never the reverse' },
	{ group: ['**/languages/markdown/**'], message: 'bib is a dependency of the other languages, never the reverse' }
];

// The web guest client (planned, post-refactor): a browser guest mounts SessionRoute ->
// WorkspaceView over a CRDT provider, so code on that path must not statically pull
// desktop-only features. Violations are the burn-down list for the web build target.
const banDesktopOnly = {
	group: [
		'**/draft/**',
		'**/terminal/**',
		'**/zotero/**',
		'**/updates',
		'**/workspace/git',
		'**/workspace/gitStore',
		'**/workspace/scmActions.svelte',
		'**/workspace/treeOps',
		'**/workspace/toolchainCatalog',
		'**/workspace/mcpPublish',
		'**/workspace/mcpCommands'
	],
	message: 'desktop-only feature; the web guest bundle must not import it statically (gate it behind isDesktop + a dynamic import)'
};

// a LaTeX plugin is one folder that imports the core's entry and nothing of another plugin (design/visual-plugins.md);
// the package data's readers and the messages are the two other things it may import. Its import and save take the
// entry's document half, which the parser's worker can load
const LATEX_PLUGINS = 'src/lib/languages/latex/visual/plugins';
const banOtherPlugins = (depth) => ({
	regex: `^(\\$lib/languages/latex/visual/plugins/|(\\.\\./){${depth}})`,
	message: 'a plugin imports its own folder and the core entry, never another plugin; what two share belongs in the core'
});
const pluginImportsCore = {
	regex: '^\\$lib/(?!languages/latex/visual/core(/document)?$|languages/latex/knowledge/|paraglide/messages$|editor/canvas$)',
	message:
		'a plugin reaches the app through the core entry, $lib/languages/latex/visual/core or its document half, and the canvas through $lib/editor/canvas'
};
// the same from inside languages/latex, where a relative path can reach a plugin folder
const banPluginFolders = {
	regex: '^\\.{1,2}/(\\.\\./)*(visual/)?plugins/',
	message: 'a LaTeX plugin is reached through latexPlugins.ts and latexDocumentPlugins.ts, never directly'
};
const latexPluginBoundary = [1, 2, 3].map((depth) => ({
	files: [`${LATEX_PLUGINS}/*/${'*/'.repeat(depth - 1)}*`],
	rules: languageBoundary([banTypst, banMarkdown, banOtherPlugins(depth), pluginImportsCore])
}));
// the same for a Typst plugin, whose package data's readers are languages/typst/knowledge
const TYPST_PLUGINS = 'src/lib/languages/typst/visual/plugins';
const banOtherTypstPlugins = (depth) => ({
	regex: `^(\\$lib/languages/typst/visual/plugins/|(\\.\\./){${depth}})`,
	message: 'a plugin imports its own folder and the core entry, never another plugin; what two share belongs in the core'
});
const typstPluginImportsCore = {
	regex: '^\\$lib/(?!languages/typst/visual/core(/document)?$|languages/typst/knowledge(/|$)|paraglide/messages$|editor/canvas$)',
	message:
		'a plugin reaches the app through the core entry, $lib/languages/typst/visual/core or its document half, and the canvas through $lib/editor/canvas'
};
const banTypstPluginFolders = {
	regex: '^\\.{1,2}/(\\.\\./)*(visual/)?plugins/',
	message: 'a Typst plugin is reached through typstPlugins.ts and typstDocumentPlugins.ts, never directly'
};
const typstPluginBoundary = [1, 2, 3].map((depth) => ({
	files: [`${TYPST_PLUGINS}/*/${'*/'.repeat(depth - 1)}*`],
	rules: languageBoundary([banLatex, banMarkdown, banOtherTypstPlugins(depth), typstPluginImportsCore])
}));

// the same for a Markdown plugin, which reads no package data
const MARKDOWN_PLUGINS = 'src/lib/languages/markdown/visual/plugins';
const banOtherMarkdownPlugins = (depth) => ({
	regex: `^(\\$lib/languages/markdown/visual/plugins/|(\\.\\./){${depth}})`,
	message: 'a plugin imports its own folder and the core entry, never another plugin; what two share belongs in the core'
});
const markdownPluginImportsCore = {
	regex: '^\\$lib/(?!languages/markdown/visual/core$|paraglide/messages$|editor/canvas$)',
	message: 'a plugin reaches the app through the core entry, $lib/languages/markdown/visual/core, and the canvas through $lib/editor/canvas'
};
const banMarkdownPluginFolders = {
	regex: '^\\.{1,2}/(\\.\\./)*(visual/)?plugins/',
	message: 'a Markdown plugin is reached through markdownPlugins.ts, never directly'
};
const markdownPluginBoundary = [1, 2, 3].map((depth) => ({
	files: [`${MARKDOWN_PLUGINS}/*/${'*/'.repeat(depth - 1)}*`],
	rules: languageBoundary([banLatex, banTypst, banOtherMarkdownPlugins(depth), markdownPluginImportsCore])
}));

// the canvas rewrite (design 2.1, 8.2, 8.7): faces and editor plugins reach the canvas through its entry, build no DOM
// and measure none. A local plugin, so these sit beside no-restricted-syntax instead of replacing its options
const LIB_ROOT = fileURLToPath(new URL('./src/lib', import.meta.url));
const CANVAS_ROOT = path.join(LIB_ROOT, 'editor/canvas');
/** an import, $lib or relative, that lands inside editor/canvas past its entry */
function reachesCanvasInternals(source, filename) {
	const relative = source.startsWith('.') ? path.resolve(path.dirname(filename), source) : null;
	const target = source.startsWith('$lib/') ? path.join(LIB_ROOT, source.slice(5)) : relative;
	const inside = target === null ? '..' : path.relative(CANVAS_ROOT, target);
	return inside !== '' && !inside.startsWith('..') && !path.isAbsolute(inside) && !/^index(\.ts)?$/.test(inside);
}
const MEASUREMENT = new Set(['offsetWidth', 'clientWidth', 'offsetParent']);
const canvasPlugin = {
	rules: {
		'entry-only': {
			meta: {
				type: 'problem',
				messages: { banned: 'the canvas is reached through its entry, $lib/editor/canvas (editor/canvas/index.ts)' }
			},
			create(context) {
				const check = (node) => {
					const value = node.source?.type === 'Literal' ? node.source.value : null;
					if (typeof value === 'string' && reachesCanvasInternals(value, context.filename))
						context.report({ node: node.source, messageId: 'banned' });
				};
				return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check, ImportExpression: check };
			}
		},
		'no-new-editor-view': {
			meta: {
				type: 'problem',
				messages: { banned: 'the visual editors draw on the canvas: build a canvas view, never an EditorView of prosemirror-view' }
			},
			create(context) {
				const names = new Set();
				return {
					ImportDeclaration(node) {
						if (node.source.value !== 'prosemirror-view') return;
						for (const s of node.specifiers) if (s.type === 'ImportSpecifier' && s.imported.name === 'EditorView') names.add(s.local.name);
					},
					NewExpression(node) {
						if (node.callee.type === 'Identifier' && names.has(node.callee.name)) context.report({ node, messageId: 'banned' });
					}
				};
			}
		},
		'no-document-in-faces': {
			meta: {
				type: 'problem',
				messages: { banned: 'a face builds FaceElements (faceElement, ctx.el) and mounts nothing; controls are overlays' }
			},
			create(context) {
				return {
					'MemberExpression[object.type="Identifier"][object.name="document"]': (node) => context.report({ node, messageId: 'banned' }),
					'CallExpression[callee.type="Identifier"][callee.name="mount"]': (node) => context.report({ node, messageId: 'banned' })
				};
			}
		},
		'no-computed-style': {
			meta: {
				type: 'problem',
				messages: {
					banned: 'the canvas holds its own styles (S1): only the theme token probe (style/theme/themeTokens.ts) reads computed CSS'
				}
			},
			create(context) {
				return {
					Identifier(node) {
						if (node.name === 'getComputedStyle') context.report({ node, messageId: 'banned' });
					},
					Literal(node) {
						if (typeof node.value === 'string' && node.value.includes('data-canvas-mirror')) context.report({ node, messageId: 'banned' });
					}
				};
			}
		},
		'no-class-lookup': {
			meta: {
				type: 'problem',
				messages: { banned: 'a class on a canvas element names it and draws nothing: the resolver reads looks, never classes' }
			},
			create(context) {
				const LOOKUPS = new Set(['classList', 'className', 'matches', 'closest', 'querySelector', 'querySelectorAll']);
				return {
					MemberExpression(node) {
						if (!node.computed && node.property.type === 'Identifier' && LOOKUPS.has(node.property.name))
							context.report({ node, messageId: 'banned' });
					}
				};
			}
		},
		'no-dom-measurement': {
			meta: { type: 'problem', messages: { banned: 'the canvas lays the document out; read geometry from view.canvas, never the DOM' } },
			create(context) {
				return {
					MemberExpression(node) {
						if (!node.computed && node.property.type === 'Identifier' && MEASUREMENT.has(node.property.name))
							context.report({ node, messageId: 'banned' });
					}
				};
			}
		}
	}
};
// TRANSITIONAL: existing code the rules above would flag, each entry removed by the package that ports or deletes it
const FACE_FOLDERS = [
	'src/lib/editor/visual/extensions/drawnChips/**/*.ts',
	'src/lib/editor/visual/extensions/*/canvas/**/*.ts',
	'src/lib/languages/*/visual/core/**/*.ts',
	'src/**/*Face.ts',
	'src/**/*Faces.ts',
	'src/**/*Face.svelte.ts',
	'src/**/*Part.ts',
	'src/**/*Parts.ts'
];
const FACES_STILL_ON_DOM = [
	'src/lib/editor/visual/extensions/drawnChips/chipFace.ts', // W11
	'src/lib/editor/visual/extensions/drawnChips/chipPanel/chipPanel.svelte.ts', // W11
	'src/lib/editor/visual/extensions/drawnChips/titleBlock/titleLine.ts', // W11
	'src/lib/languages/latex/visual/core/own/ownMathRun.ts', // W11
	'src/lib/languages/latex/visual/core/parts/textParts.ts', // W11
	'src/lib/languages/latex/visual/core/title/titleLines.ts', // W11
	'src/lib/languages/latex/visual/plugins/algorithm/algorithmFace.ts', // W12
	'src/lib/languages/latex/visual/plugins/citation/citeFace.svelte.ts', // W12
	'src/lib/languages/latex/visual/plugins/glossary/glossaryFace.svelte.ts', // W12
	'src/lib/languages/latex/visual/plugins/list/listEnvironmentFace.ts', // W12
	'src/lib/languages/latex/visual/plugins/picture/figureCardFace.svelte.ts', // W12
	'src/lib/languages/latex/visual/plugins/picture/pictureFace.ts', // W12
	'src/lib/languages/typst/visual/core/code/silentFace.ts', // W13
	'src/lib/languages/typst/visual/core/own/markupDrawing.ts', // W13
	'src/lib/languages/typst/visual/core/parts/argumentDrawing.ts', // W13
	'src/lib/languages/typst/visual/core/parts/environmentCard.ts', // W13
	'src/lib/languages/typst/visual/core/scope/scopeFollowingFace.ts', // W13
	'src/lib/languages/typst/visual/core/setup/titleBlockFace.ts', // W13
	'src/lib/languages/typst/visual/plugins/date/dateFace.ts', // W13
	'src/lib/languages/typst/visual/plugins/element/elementFace.ts', // W13
	'src/lib/languages/typst/visual/plugins/glossary/glossaryFace.ts', // W13
	'src/lib/languages/typst/visual/plugins/picture/pictureFace.ts', // W13
	'src/lib/languages/typst/visual/plugins/printedCode/printedFace.ts' // W13
];
const DOM_MEASUREMENT_READERS = [
	'src/lib/editor/visual/extensions/table/columnResizing.ts', // W6
	'src/lib/editor/visual/extensions/table/captureColumnWidths.ts', // W6
	'src/lib/editor/visual/extensions/image/plugin/imageNodeView.ts', // W6
	'src/lib/editor/visual/extensions/image/plugin/resize/createResizeControls.ts', // W6
	'src/lib/editor/visual/extensions/image/plugin/resize/getMaxWidth.ts', // W6
	'src/lib/editor/visual/extensions/image/ImageSettingsPanel.svelte', // W6
	'src/lib/editor/visual/extensions/mathlivebridge/macroArgs/mathMacroPanel.ts' // W8
];
// HTML that measures itself, not the document
const MEASURING_ITS_OWN_HTML = [
	'src/lib/editor/visual/extensions/cmSelectionToolbar.ts',
	'src/lib/editor/visual/extensions/pmSelectionToolbar.ts',
	'src/lib/editor/visual/extensions/mathlivebridge/mathSearch/query/keepInSight.ts',
	'src/lib/editor/visual/toolbar/ToolbarOverflow.svelte',
	'src/lib/editor/visual/toolbar/MathSymbolPanel.svelte'
];

export default ts.config(
	includeIgnoreFile(gitignorePath),
	// vendored pdf.js modules keep upstream style (see src/lib/draft/type1/README.md)
	{ ignores: ['build/**', 'dist/**', 'dist-web/**', 'test-results/**', 'tests/integration/report/**', 'tests/integration/results/**'] },
	{ ignores: ['src/lib/draft/type1/*.js'] },
	// generated by lezer-generator from syntax/latex.grammar, never hand-edited
	{ ignores: ['src/lib/languages/latex/syntax/parser*.ts'] },
	// prosemirror-view's own declarations with EditorView narrowed (design D2), checked against the installed ones by a test
	{ ignores: ['src/lib/editor/canvas/contracts/typings/*.d.ts'] },
	// vendored bidi-js keeps upstream's code (see its README.md)
	{ ignores: ['src/lib/editor/canvas/layout/text/bidi/*.js'] },
	// generated by the Paraglide compiler (paraglideVitePlugin in vite.config.ts), never hand-edited
	{ ignores: ['src/lib/paraglide/**'] },
	// generated by scripts/gen-typst-symbols.mjs, never hand-edited
	{ ignores: ['src/lib/languages/typst/symbols/typstSymbolTable.ts'] },
	// generated by scripts/gen-latex-symbols.mjs, never hand-edited
	{ ignores: ['src/lib/languages/latex/symbols/latexSymbolTable.ts', 'src/lib/languages/latex/symbols/latexSymbolGroups.ts'] },
	js.configs.recommended,
	...ts.configs.recommended,
	// eslint-plugin-svelte: flat-config presets live under 'flat/*'; 'recommended' is the
	// legacy-eslintrc object and is not spreadable
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: { tsconfigRootDir: import.meta.dirname }
		},
		rules: {
			'no-undef': 'off',
			// Off after a full audit of every hit (44 sites, runes migration): this codebase's
			// discipline is copy-on-write - collections are built fresh and REASSIGNED to $state
			// fields, never mutated under a tracked reader - plus private caches, function-local
			// temps, and Dates read once for toISOString(). Under that discipline a plain Map/Set is
			// the correct, cheaper choice everywhere, and the rule flags every construction anyway
			// because it cannot see how the instance is used. What must stay out of the code is
			// in-place mutation of a collection a template/$derived/$effect reads.
			'svelte/prefer-svelte-reactivity': 'off',
			// Arrived with eslint 10 / eslint-plugin-svelte 3 as warnings so the upgrade did not
			// hide behind a mass rewrite; their cleanup passes have landed and they hold at zero.
			'svelte/require-each-key': 'error',
			'svelte/no-unused-props': 'error',
			'svelte/no-useless-mustaches': 'error',
			'svelte/no-dom-manipulating': 'error',
			'no-useless-assignment': 'error',
			'preserve-caught-error': 'error',
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
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				// explicit since electron/ gained its own eslint config: with two configs in the
				// workspace the editor's eslint server refuses to infer which tsconfig root applies
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	// styles.md enforcement. Rules that the codebase already satisfies run as errors;
	// rules with existing violations run as warnings until their cleanup pass lands
	{
		files: ['src/**'],
		rules: {
			'func-style': ['error', 'declaration'],
			// `draft` is the sanctioned name for a parameter that EXISTS to be mutated (updateFolder's
			// updater callbacks, projectIntel's accumulator); anything else must return a new value
			'no-param-reassign': ['error', { props: true, ignorePropertyModificationsFor: ['draft'] }],
			'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
			'id-length': ['error', { min: 1, max: 50 }],
			'id-denylist': [
				'error',
				'data',
				'info',
				'obj',
				'tmp',
				'temp',
				'misc',
				'thing',
				'val',
				'arr',
				'foo',
				'helper',
				'helpers',
				'util',
				'utils'
			],
			'@typescript-eslint/consistent-type-definitions': ['error', 'type']
		}
	},
	{
		files: ['src/**/*.ts'],
		rules: {
			'no-restricted-exports': ['warn', { restrictDefaultExports: { direct: true, named: true } }]
		}
	},
	// curated/vendored completion data: tables, not logic - line count is not a smell there
	{
		files: ['src/lib/languages/latex/intellisense/data/**'],
		rules: { 'max-lines': 'off' }
	},
	// vendored-adapted files keep upstream's file shapes so diffs against upstream stay readable
	// (the pdf.js viewer, prosemirror-tables' columnresizing); the two symbol/keyboard files are
	// data tables like the completion data above
	{
		files: [
			'src/lib/pdf-view/pdf-viewer/**',
			'src/lib/editor/visual/extensions/table/columnResizing.ts',
			'src/lib/editor/visual/toolbar/mathSymbols.ts',
			'src/lib/editor/visual/extensions/mathlivebridge/virtualKeyboardConfig.ts'
		],
		rules: { 'max-lines': 'off' }
	},
	// package-private folders: internals are importable only within their own folder
	{
		files: ['src/**'],
		ignores: ['src/lib/languages/latex/schema/**', 'src/lib/languages/bib/**', 'src/lib/editor/visual/schema/**'],
		rules: {
			'no-restricted-imports': ['error', { paths: restrictedImportPaths, patterns: packagePrivatePatterns }]
		}
	},
	// the web-safe set: what a browser guest session mounts (see banDesktopOnly above)
	{
		files: [
			'src/lib/collab/**',
			'src/lib/editor/**',
			'src/lib/comments/**',
			'src/lib/pdf-view/**',
			'src/lib/search/**',
			'src/lib/palette/**',
			'src/lib/modals/**',
			'src/lib/components/**',
			'src/views/SessionRoute.svelte'
		],
		rules: {
			'no-restricted-imports': ['error', { paths: restrictedImportPaths, patterns: [...packagePrivatePatterns, banDesktopOnly] }]
		}
	},
	{
		files: ['src/lib/workspace/diskProvider.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ paths: restrictedImportPaths, patterns: packagePrivatePatterns.filter((p) => p !== banDiskAccess) }
			]
		}
	},
	{
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		ignores: ['src/lib/workspace/fileSystem.ts', 'src/lib/workspace/diskProvider.ts', 'src/lib/files/service/fileService.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'CallExpression > MemberExpression.callee[property.name=/^fs[A-Z]/]',
					message: 'the native fs bridge has one caller, lib/workspace/fileSystem.ts; go through fileService'
				},
				{
					selector: `CallExpression > MemberExpression.callee[property.name=${PROVIDER_IO}]:matches([object.name='provider'], [object.property.name='provider'], [object.callee.property.name='provider'])`,
					message: 'go through fileService, which picks the provider per path and reports what this window did'
				}
			]
		}
	},
	// cross-language boundaries (see languageBoundary above)
	{ files: ['src/lib/languages/latex/**'], rules: languageBoundary([banTypst, banMarkdown, banPluginFolders]) },
	{
		files: ['src/lib/languages/latex/visual/latexPlugins.ts', 'src/lib/languages/latex/visual/latexDocumentPlugins.ts'],
		rules: languageBoundary([banTypst, banMarkdown])
	},
	...latexPluginBoundary,
	{ files: ['src/lib/languages/typst/**'], rules: languageBoundary([banLatex, banMarkdown, banTypstPluginFolders]) },
	{
		files: ['src/lib/languages/typst/visual/typstPlugins.ts', 'src/lib/languages/typst/visual/typstDocumentPlugins.ts'],
		rules: languageBoundary([banLatex, banMarkdown])
	},
	...typstPluginBoundary,
	{ files: ['src/lib/languages/markdown/**'], rules: languageBoundary([banLatex, banTypst, banMarkdownPluginFolders]) },
	{ files: ['src/lib/languages/markdown/visual/markdownPlugins.ts'], rules: languageBoundary([banLatex, banTypst]) },
	...markdownPluginBoundary,
	{
		files: ['src/lib/languages/bib/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ paths: restrictedImportPaths, patterns: [...banAll, banPackageData, banDiskAccess, banDesktopOnly] }
			]
		}
	},
	{
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		rules: {
			'@typescript-eslint/naming-convention': [
				'error',
				// imported names are library-controlled; the deliberate CMView/PMView aliases live here too
				{ selector: 'import', format: null },
				// object keys often mirror external shapes (HTTP headers, CSS props, wire formats)
				{ selector: 'objectLiteralProperty', format: null },
				{ selector: 'typeProperty', format: null },
				{ selector: 'variable', modifiers: ['destructured'], format: null },
				// StrictPascalCase: variables holding Svelte components (lazy routes) are capitalized
				// by Svelte convention; allowDouble: build-injected globals like __APP_VERSION__; a single _ marks
				// a variable unused, as no-unused-vars reads it
				{
					selector: 'variable',
					format: ['strictCamelCase', 'StrictPascalCase', 'UPPER_CASE'],
					leadingUnderscore: 'allowSingleOrDouble',
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
	},
	{ plugins: { canvas: canvasPlugin } },
	{ files: ['src/**/*.ts', 'src/**/*.svelte'], rules: { 'canvas/no-new-editor-view': 'error' } },
	{
		files: FACE_FOLDERS,
		ignores: ['src/lib/languages/*/visual/core/plugin/**', ...FACES_STILL_ON_DOM],
		rules: { 'canvas/no-document-in-faces': 'error' }
	},
	{
		files: [
			'src/lib/editor/canvas/**/*.{ts,svelte}',
			'src/lib/editor/visual/**/*.{ts,svelte}',
			'src/lib/languages/*/visual/**/*.{ts,svelte}'
		],
		ignores: [...DOM_MEASUREMENT_READERS, ...MEASURING_ITS_OWN_HTML],
		rules: { 'canvas/no-dom-measurement': 'error' }
	},
	{
		files: ['src/lib/editor/canvas/**/*.{ts,svelte}'],
		ignores: ['src/lib/editor/canvas/style/theme/themeTokens.ts'],
		rules: { 'canvas/no-computed-style': 'error' }
	},
	{ files: ['src/lib/editor/canvas/style/**/*.ts'], rules: { 'canvas/no-class-lookup': 'error' } },
	// editor plugins, the language cores and element plugins reach the canvas through its entry; the mounts build it
	{
		files: ['src/lib/editor/visual/**', 'src/lib/draw/host/card/**', 'src/lib/languages/*/visual/{core,plugins}/**'],
		rules: { 'canvas/entry-only': 'error' }
	}
);
