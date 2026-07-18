// \usepackage{...} and \documentclass{...} name completion, from the curated lists in data/.
// only reachable in Source mode (that's where the preamble is actually edited, see
// SourceEditor.svelte's texSource binding — the visual/WYSIWYG editor never touches the preamble).
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { CLASS_NAMES, type ClassInfo } from '../data/classnames';
import { PACKAGE_NAMES, type PackageInfo } from '../data/packagenames';

// curated everyday names rank above the CTAN long tail; the CTAN page rides along as info text
function nameOption(e: ClassInfo | PackageInfo, type: string): Completion {
	const o: Completion = { label: e.name, type, detail: e.detail };
	if (e.common) o.boost = 10;
	if (e.url) o.info = e.url;
	return o;
}

const CLASS_OPTIONS: Completion[] = CLASS_NAMES.map((c) => nameOption(c, 'class'));
const PACKAGE_OPTIONS: Completion[] = PACKAGE_NAMES.map((p) => nameOption(p, 'module'));

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
