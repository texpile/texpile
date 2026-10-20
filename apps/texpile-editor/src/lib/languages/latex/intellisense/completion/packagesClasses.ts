/* eslint id-denylist: "off" -- "info" here is @codemirror/autocomplete's Completion field */
// \usepackage{...} and \documentclass{...} name completion, from the catalog and the bundled package files.
// only reachable in Source mode (that's where the preamble is actually edited, see
// SourceEditor.svelte's texSource binding — the visual/WYSIWYG editor never touches the preamble).
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { bundledIds } from '../../knowledge/bundledFiles';
import { catalogEntry, catalogIds } from '../../knowledge/catalog';
import { loaderOpening, loadersOf, type LoaderRole } from '../packages/loaderCommands';
import { filePathStore } from '$lib/stores/editorStore';

// everyday names rank above the CTAN long tail; the CTAN page rides along as info text
function nameOption(id: string, type: string): Completion {
	const e = catalogEntry(id);
	const o: Completion = { label: id.slice(id.indexOf('/') + 1), type, detail: e?.about };
	if (e?.common) o.boost = 10;
	if (e?.url) o.info = e.url;
	return o;
}

// dated copies (circuitikz-0.9.3) load through \usepackage{circuitikz}[=v0.9.3]
const DATED = /[A-Za-z][-_]v?\d+(?:[.-]\d+)*$/;

function optionsUnder(folder: string, type: string): Completion[] {
	const bundled = bundledIds().filter((id) => id.startsWith(`${folder}/`) && !(folder === 'packages' && DATED.test(id)));
	return [...new Set([...catalogIds(folder), ...bundled])].map((id) => nameOption(id, type));
}

const CLASS_OPTIONS = optionsUnder('classes', 'class');
const PACKAGE_OPTIONS = optionsUnder('packages', 'module');

function nameTrigger(role: LoaderRole): RegExp {
	const names = loadersOf([role], true).map((l) => `${loaderOpening(l)}\\{[a-zA-Z0-9${l.arg.list ? ',' : ''}-]*`);
	return new RegExp(`(?:${names.join('|')})$`);
}

const NAME_SOURCES = [
	{ trigger: nameTrigger('class'), options: CLASS_OPTIONS, ext: '.cls', type: 'class' },
	{ trigger: nameTrigger('package'), options: PACKAGE_OPTIONS, ext: '.sty', type: 'module' }
];

// the folder's own files, which TeX finds beside the main file
function folderOptions(ext: string, type: string): Completion[] {
	return filePathStore.current
		.filter((p) => !p.includes('/') && p.toLowerCase().endsWith(ext))
		.map((p) => ({ label: p.slice(0, -ext.length), type, detail: 'in this folder', boost: 20 }));
}

export function packageClassCompletionSource(ctx: CompletionContext): CompletionResult | null {
	for (const { trigger, options, ext, type } of NAME_SOURCES) {
		const match = ctx.matchBefore(trigger);
		if (!match) continue;
		const sepAt = Math.max(match.text.lastIndexOf('{'), match.text.lastIndexOf(','));
		const own = folderOptions(ext, type);
		const names = new Set(own.map((o) => o.label));
		return { from: match.from + sepAt + 1, options: [...own, ...options.filter((o) => !names.has(o.label))], validFor: /^[a-zA-Z0-9-]*$/ };
	}
	return null;
}
