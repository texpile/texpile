/* eslint id-denylist: "off" -- "info" here is @codemirror/autocomplete's Completion field, also the vendored LaTeX Workshop data shape */
// \usepackage{...} and \documentclass{...} name completion, from the curated lists in data/ and the bundled package files.
// only reachable in Source mode (that's where the preamble is actually edited, see
// SourceEditor.svelte's texSource binding — the visual/WYSIWYG editor never touches the preamble).
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { CLASS_NAMES, type ClassInfo } from '../data/classnames';
import { PACKAGE_NAMES, type PackageInfo } from '../data/packagenames';
import { bundledPackageNames } from '../packages/packageData';

// curated everyday names rank above the CTAN long tail; the CTAN page rides along as info text
function nameOption(e: ClassInfo | PackageInfo, type: string): Completion {
	const o: Completion = { label: e.name, type, detail: e.detail };
	if (e.common) o.boost = 10;
	if (e.url) o.info = e.url;
	return o;
}

// libraries and beamer themes load through their own commands, rollback copies (circuitikz-0.9.3) through
// \usepackage{circuitikz}[=v0.9.3]
const NOT_A_PACKAGE =
	/^(?:tikz|pgf|pgfplots|tcolorbox)library|^beamer(?:color|font|inner|outer)?theme|^latex-document$|[A-Za-z][-_]v?\d+(?:[.-]\d+)*$/;
const BUNDLED = bundledPackageNames();
function listed(names: { name: string }[]): Set<string> {
	return new Set(names.map((n) => n.name));
}
const CLASSES = listed(CLASS_NAMES);
const PACKAGES = listed(PACKAGE_NAMES);

const CLASS_OPTIONS: Completion[] = [
	...CLASS_NAMES.map((c) => nameOption(c, 'class')),
	...BUNDLED.filter((n) => n.startsWith('class-') && !CLASSES.has(n.slice(6))).map((n) => ({ label: n.slice(6), type: 'class' }))
];
const PACKAGE_OPTIONS: Completion[] = [
	...PACKAGE_NAMES.map((p) => nameOption(p, 'module')),
	...BUNDLED.filter((n) => !n.startsWith('class-') && !NOT_A_PACKAGE.test(n) && !PACKAGES.has(n)).map((n) => ({ label: n, type: 'module' }))
];

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
