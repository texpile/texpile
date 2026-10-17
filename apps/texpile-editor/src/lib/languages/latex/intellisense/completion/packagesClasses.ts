/* eslint id-denylist: "off" -- "info" here is @codemirror/autocomplete's Completion field */
// \usepackage{...} and \documentclass{...} name completion, from the catalog and the bundled package files.
// only reachable in Source mode (that's where the preamble is actually edited, see
// SourceEditor.svelte's texSource binding — the visual/WYSIWYG editor never touches the preamble).
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { bundledIds } from '../../knowledge/bundledFiles';
import { catalogEntry, catalogIds } from '../../knowledge/catalog';

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

const DOCUMENTCLASS_NAME = /\\documentclass(?:\[[^\]]*\])?\{([a-zA-Z0-9,-]*)$/;
const USEPACKAGE_NAME = /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([a-zA-Z0-9,-]*)$/;

export function packageClassCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const cls = ctx.matchBefore(DOCUMENTCLASS_NAME);
	if (cls) {
		const from = cls.from + cls.text.lastIndexOf('{') + 1;
		return { from, options: CLASS_OPTIONS, validFor: /^[a-zA-Z0-9-]*$/ };
	}
	const pkg = ctx.matchBefore(USEPACKAGE_NAME);
	if (pkg) {
		// \usepackage{a,b,c} allows a comma list; complete only the last name being typed
		const sepAt = Math.max(pkg.text.lastIndexOf('{'), pkg.text.lastIndexOf(','));
		const from = pkg.from + sepAt + 1;
		return { from, options: PACKAGE_OPTIONS, validFor: /^[a-zA-Z0-9-]*$/ };
	}
	return null;
}
