// environment name completion inside \begin{…}/\end{…}, plus two LaTeX-Workshop-style extras:
// "ForBegin" (accepting a fresh \begin{name} immediately builds the whole block + matching \end)
// and close-environment (finishing \begin{name} by hand offers the matching \end{name} next).
import { get } from 'svelte/store';
import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { environmentInfo } from '@unified-latex/unified-latex-ctan';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { renderSignature } from './shared';
import { withFrecency } from './frecency';

type InfoMap = Record<string, Record<string, { signature?: string }>>;

function collectSignatures(info: InfoMap, extra: Record<string, string> = {}): Map<string, string> {
	const out = new Map<string, string>();
	for (const pkg of Object.values(info))
		for (const [name, def] of Object.entries(pkg)) if (!out.has(name)) out.set(name, def.signature ?? '');
	for (const [name, sig] of Object.entries(extra)) if (!out.has(name)) out.set(name, sig);
	return out;
}

const EXTRA_ENVS: Record<string, string> = {
	align: '',
	'align*': '',
	gather: '',
	'gather*': '',
	multline: '',
	'multline*': '',
	cases: '',
	equation: '',
	'equation*': '',
	matrix: '',
	pmatrix: '',
	bmatrix: '',
	// LaTeX Workshop's default environment list beyond the CTAN DB
	subarray: '',
	eqnarray: '',
	subequations: '',
	'subequations*': '',
	gathered: '',
	alignedat: '',
	xalignat: '',
	'xalignat*': '',
	center: '',
	flushleft: '',
	flushright: '',
	quotation: '',
	quote: '',
	verbatim: '',
	verse: '',
	titlepage: ''
};

// LW body snippets: list envs start with their first \item instead of an empty line
const ENV_BODY: Record<string, string> = {
	itemize: '\n\t\\item ${0}',
	enumerate: '\n\t\\item ${0}',
	description: '\n\t\\item[${1}] ${0}'
};

const ENV_SIGNATURE_MAP = collectSignatures(environmentInfo as InfoMap, EXTRA_ENVS);
const ENV_NAMES = [...ENV_SIGNATURE_MAP.keys()].sort((a, b) => a.localeCompare(b));

function asNameOption(name: string, detail?: string): Completion {
	return { label: name, type: 'class', detail: detail ?? renderSignature(ENV_SIGNATURE_MAP.get(name) ?? '') };
}

function forBeginOption(name: string, detail?: string): Completion {
	return snippetCompletion(`${name}}${ENV_BODY[name] ?? '\n\t${0}'}\n\\end{${name}}`, {
		label: name,
		type: 'class',
		detail: detail ?? renderSignature(ENV_SIGNATURE_MAP.get(name) ?? '')
	});
}

/** plain name completion, used for \end{…} and mid-edit \begin{…} (content already follows). */
const AS_NAME_OPTIONS: Completion[] = ENV_NAMES.map((n) => asNameOption(n));

/** accepting this immediately builds \begin{name}\n\t$0\n\end{name} — used for a fresh \begin{. */
const FOR_BEGIN_OPTIONS: Completion[] = ENV_NAMES.map((n) => forBeginOption(n));

/** \envname entries for the macro dropdown: accepting builds the whole block (LW's AsMacro form). */
export const ENV_AS_MACRO_OPTIONS: Completion[] = ENV_NAMES.map((name) =>
	snippetCompletion(`\\begin{${name}}${ENV_BODY[name] ?? '\n\t${0}'}\n\\end{${name}}`, {
		label: '\\' + name,
		type: 'class',
		detail: 'environment'
	})
);

// environments \begin-used or \newenvironment-defined in the buffer but absent from the static DB
const ENV_USAGE = /\\(?:begin|(?:re)?newenvironment|NewDocumentEnvironment)\{([a-zA-Z][^{}\s]*)\}/g;
let usedCache: { text: string; names: string[] } | null = null;

function bufferEnvNames(text: string): string[] {
	if (usedCache?.text === text) return usedCache.names;
	const names = new Set<string>();
	ENV_USAGE.lastIndex = 0;
	for (let m = ENV_USAGE.exec(text); m; m = ENV_USAGE.exec(text)) {
		if (!ENV_SIGNATURE_MAP.has(m[1])) names.add(m[1]);
	}
	usedCache = { text, names: [...names].sort((a, b) => a.localeCompare(b)) };
	return usedCache.names;
}

// innermost \begin left unclosed before pos, so \end{ offers the right name first (LW's closeenv)
function openEnvName(text: string): string | null {
	const stack: string[] = [];
	const re = /\\(begin|end)\{([a-zA-Z][^{}\s]*)\}/g;
	for (let m = re.exec(text); m; m = re.exec(text)) {
		if (m[1] === 'begin') stack.push(m[2]);
		else if (stack.length && stack[stack.length - 1] === m[2]) stack.pop();
	}
	return stack.length ? stack[stack.length - 1] : null;
}

const BEGIN_OR_END = /\\(begin|end)\{([a-zA-Z*]*)$/;
const BEGIN_CLOSED = /\\begin\{([^{}\s]+)\}$/; // fires the instant the closing brace is typed by hand

export function environmentCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const closed = ctx.matchBefore(BEGIN_CLOSED);
	if (closed) {
		const name = closed.text.slice('\\begin{'.length, -1);
		return {
			from: closed.to,
			options: [snippetCompletion('\n${0}\n\\end{' + name + '}', { label: `\\end{${name}}`, type: 'class' })],
			validFor: /^$/
		};
	}

	const match = ctx.matchBefore(BEGIN_OR_END);
	if (!match) return null;
	const from = match.from + match.text.indexOf('{') + 1;
	const isBegin = match.text.startsWith('\\begin');
	// "fresh" \begin{: nothing but the closing brace follows on this line, and no other content
	// already sits after the cursor — mid-edit renames (content already typed after) get the
	// plain name instead of duplicating a \end.
	const afterCursor = ctx.state.sliceDoc(ctx.pos, ctx.state.doc.lineAt(ctx.pos).to);
	const isFresh = isBegin && /^\*?\}?\s*$/.test(afterCursor);
	const text = ctx.state.doc.toString();
	const fromBuffer = bufferEnvNames(text);
	const bufferSet = new Set(fromBuffer);
	const fromProject = [...new Set(get(projectIntelStore).envs.map((e) => e.name))].filter(
		(n) => !ENV_SIGNATURE_MAP.has(n) && !bufferSet.has(n)
	);
	let options = [
		...(isFresh ? FOR_BEGIN_OPTIONS : AS_NAME_OPTIONS),
		...fromBuffer.map((n) => (isFresh ? forBeginOption(n, 'in this file') : asNameOption(n, 'in this file'))),
		...fromProject.map((n) => (isFresh ? forBeginOption(n, 'in this project') : asNameOption(n, 'in this project')))
	];
	if (!isBegin) {
		const open = openEnvName(text.slice(0, match.from));
		if (open) {
			const known = options.some((o) => o.label === open);
			options = known
				? options.map((o) => (o.label === open ? { ...o, boost: 99 } : o))
				: [{ ...asNameOption(open, 'closes the open \\begin'), boost: 99 }, ...options];
		}
	}
	return { from, options: withFrecency(options), validFor: /^[a-zA-Z*]*$/ };
}
