// environment name completion inside \begin{…}/\end{…}, plus two LaTeX-Workshop-style extras:
// "ForBegin" (accepting a fresh \begin{name} immediately builds the whole block + matching \end)
// and close-environment (finishing \begin{name} by hand offers the matching \end{name} next).
import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { withFrecency } from './frecency';
import { documentPackages, isDegraded } from '../packages/loadedPackages';
import { withDegradedHeading } from '../packages/degradedSection';
import { packageCompletions, type EnvironmentName } from '../packages/packageCompletions';
import { offeringPackage, packageSuggestions } from '../packages/packageSuggestions';

// LW body snippets: list envs start with their first \item instead of an empty line
const ENV_BODY: Record<string, string> = {
	itemize: '\n\t\\item ${0}',
	enumerate: '\n\t\\item ${0}',
	description: '\n\t\\item[${1}] ${0}'
};

function asNameOption(name: string, detail?: string): Completion {
	return { label: name, type: 'class', detail };
}

function forBeginOption(name: string, detail?: string): Completion {
	const option = snippetCompletion(`${name}}${ENV_BODY[name] ?? '\n\t${0}'}\n\\end{${name}}`, { label: name, type: 'class', detail });
	// for handeling auto closing [] and {}...etc
	const apply = option.apply as Exclude<Completion['apply'], string | undefined>;
	return {
		...option,
		apply: (view, completion, from, to) => apply(view, completion, from, to + (view.state.sliceDoc(to, to + 1) === '}' ? 1 : 0))
	};
}

const macroForms = new WeakMap<EnvironmentName[], Completion[]>();

/** \envname entries for the macro dropdown: accepting builds the whole block (LW's AsMacro form). */
export function environmentMacroOptions(envs: EnvironmentName[]): Completion[] {
	let options = macroForms.get(envs);
	if (!options) {
		options = envs.map(({ name }) =>
			snippetCompletion(`\\begin{${name}}${ENV_BODY[name] ?? '\n\t${0}'}\n\\end{${name}}`, {
				label: '\\' + name,
				type: 'class',
				detail: 'environment'
			})
		);
		macroForms.set(envs, options);
	}
	return options;
}

// environments \begin-used or \newenvironment-defined in the buffer
const ENV_USAGE = /\\(?:begin|(?:re)?newenvironment|NewDocumentEnvironment)\{([a-zA-Z][^{}\s]*)\}/g;
let usedCache: { text: string; names: string[] } | null = null;

function bufferEnvNames(text: string): string[] {
	if (usedCache?.text === text) return usedCache.names;
	const names = new Set<string>();
	ENV_USAGE.lastIndex = 0;
	for (let m = ENV_USAGE.exec(text); m; m = ENV_USAGE.exec(text)) {
		names.add(m[1]);
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

export async function environmentCompletionSource(ctx: CompletionContext): Promise<CompletionResult | null> {
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
	const loaded = await documentPackages(text);
	const { envs, envNames } = packageCompletions(loaded);
	const fromBuffer = bufferEnvNames(text).filter((n) => !envNames.has(n));
	const taken = new Set([...envNames, ...fromBuffer]);
	const fromProject = [...new Set(projectIntelStore.current.envs.map((e) => e.name))].filter((n) => !taken.has(n) && (taken.add(n), true));
	const suggested = isBegin
		? (await packageSuggestions(loaded, text)).envs.filter((e) => !taken.has(e.name) && (taken.add(e.name), true))
		: [];
	let options = [
		...envs.map((e) => (isFresh ? forBeginOption(e.name, e.detail) : asNameOption(e.name, e.detail))),
		...fromBuffer.map((n) => (isFresh ? forBeginOption(n, 'in this file') : asNameOption(n, 'in this file'))),
		...fromProject.map((n) => (isFresh ? forBeginOption(n, 'in this project') : asNameOption(n, 'in this project'))),
		...suggested.map((e) => offeringPackage(isFresh ? forBeginOption(e.name) : asNameOption(e.name), e.pkg, `\\begin{${e.name}}`))
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
	return { from, options: withDegradedHeading(withFrecency(options), isDegraded(loaded)), validFor: /^[a-zA-Z*]*$/ };
}
