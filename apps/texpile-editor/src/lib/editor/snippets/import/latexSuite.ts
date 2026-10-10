import { JsExpression, JsRegex, readJsLiteral, type JsValue } from './jsLiteral';
import type { SnippetContext } from '../file/snippetTypes';

export type SnippetEntry = Record<string, string | number | boolean>;
export type SkippedSuiteSnippet = { name: string; reason: string };
export type SuiteConversion = { entries: [string, SnippetEntry][]; skipped: SkippedSuiteSnippet[] };

type SuiteObject = { [key: string]: JsValue };

function isObject(v: JsValue): v is SuiteObject {
	return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof JsRegex) && !(v instanceof JsExpression);
}

/** LaTeX Suite's mode letters as a context, or why the snippet has no place here */
function contextOf(options: string): SnippetContext | { reason: string } {
	const text = options.includes('t');
	const display = options.includes('M') || options.includes('m');
	const inline = options.includes('n') || options.includes('m');
	if (text) return display || inline ? 'any' : 'text';
	if (display && inline) return 'math';
	if (display || inline) return display ? 'display-math' : 'inline-math';
	if (options.includes('T')) return { reason: 'works only inside \\text{} in math, which Texpile does not tell apart from text' };
	return /[cC]/.test(options) ? { reason: 'works in code blocks only' } : 'any';
}

/** LaTeX Suite's replacement as a snippet body: its stops start at $0, and a backslash is LaTeX */
export function suiteBody(text: string): string {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		const next = text[i + 1] ?? '';
		if (c === '\\' && next === '\\') {
			out += '\\\\\\\\';
			i++;
		} else if (c === '\\' && next === '$') {
			out += '\\\\\\$';
			i++;
		} else if (c === '\\' && next === '}') out += '\\\\';
		else if (text.startsWith('${VISUAL}', i)) {
			out += '${TM_SELECTED_TEXT}';
			i += '${VISUAL}'.length - 1;
		} else if (c === '$') {
			const stop = /^\$(?:(\d+)|\{(\d+)([:}]))/.exec(text.slice(i));
			if (stop?.[1] !== undefined) out += `$${Number(stop[1]) + 1}`;
			else if (stop) out += `\${${Number(stop[2]) + 1}${stop[3]}`;
			else out += /[\w{]/.test(next) ? '\\$' : '$';
			if (stop) i += stop[0].length - 1;
		} else out += c;
	}
	return out;
}

function nameFor(raw: SuiteObject, index: number, taken: Set<string>): string {
	const trigger = raw.trigger instanceof JsRegex ? raw.trigger.source : raw.trigger;
	const base =
		(typeof raw.description === 'string' && raw.description) || (typeof trigger === 'string' && trigger) || `Snippet ${index + 1}`;
	let name = base;
	for (let n = 2; taken.has(name); n++) name = `${base} (${n})`;
	taken.add(name);
	return name;
}

function entryOf(raw: SuiteObject): SnippetEntry | string {
	const options = typeof raw.options === 'string' ? raw.options : '';
	const context = contextOf(options);
	if (typeof context !== 'string') return context.reason;
	if (typeof raw.replacement !== 'string')
		return raw.replacement ? 'its replacement is a function, which only Obsidian can run' : 'has no replacement';
	const entry: SnippetEntry = { scope: 'latex,markdown', context, body: suiteBody(raw.replacement) };
	const trigger = raw.trigger;
	if (typeof trigger === 'string' && trigger) {
		entry.prefix = trigger;
		if (options.includes('r')) entry.regex = true;
	} else if (trigger instanceof JsRegex) {
		entry.prefix = trigger.source;
		entry.regex = true;
		const flags = [...trigger.flags].filter((f) => f === 'i' || f === 'u').join('');
		if (flags) entry.flags = flags;
	} else return trigger instanceof JsExpression ? 'its trigger is code, which only Obsidian can run' : 'has no trigger';
	// a visual snippet runs on the selection: here that is Wrap With, so it needs no trigger
	if (options.includes('v')) delete entry.prefix;
	else if (options.includes('A')) entry.auto = true;
	if (options.includes('w')) entry.word = true;
	if (typeof raw.description === 'string' && raw.description) entry.description = raw.description;
	if (typeof raw.priority === 'number' && raw.priority) entry.priority = raw.priority;
	return entry;
}

/** a LaTeX Suite snippets file as snippet entries; what cannot carry over is listed with why */
export function convertLatexSuite(source: string): SuiteConversion {
	const list = readJsLiteral(source);
	if (!Array.isArray(list)) throw new Error('the file holds no list of snippets');
	const taken = new Set<string>();
	const out: SuiteConversion = { entries: [], skipped: [] };
	list.forEach((raw, index) => {
		if (!isObject(raw)) return out.skipped.push({ name: `Snippet ${index + 1}`, reason: 'is not an object' });
		const name = nameFor(raw, index, taken);
		const entry = entryOf(raw);
		if (typeof entry === 'string') out.skipped.push({ name, reason: entry });
		else out.entries.push([name, entry]);
	});
	return out;
}
