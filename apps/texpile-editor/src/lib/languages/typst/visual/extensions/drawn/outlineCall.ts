// an outline as its settings: what it lists (the headings, or the figures or tables), its title and how deep it goes.
// An argument it has no setting for (indent:, fill:) is kept as written
import { typStr } from '../../serialize/typstInline';
import { unquote } from '../../convert/inlineConvert';
import { blockMarkup, namedArg, readTypstCall, rewrittenCall, type CallArg, type TypstCall } from './typstCall';

export type OutlineShows = 'headings' | 'figures' | 'tables' | 'other';

/** `auto` is Typst's own title in the document's language; a written one is `quoted` when it is a string */
export type OutlineTitle = { kind: 'auto' } | { kind: 'none' } | { kind: 'written'; text: string; quoted: boolean };

export type OutlineCall = { shows: OutlineShows; title: OutlineTitle; depth: number | null };

const TARGETS: Record<Exclude<OutlineShows, 'other'>, string | null> = {
	headings: null,
	figures: 'figure.where(kind: image)',
	tables: 'figure.where(kind: table)'
};

function showsOf(target: CallArg | null): OutlineShows {
	if (!target || target.value === 'heading') return 'headings';
	const where = readTypstCall(`#${target.value}`);
	const kind = where && namedArg(where, 'kind');
	if (!where || where.name !== 'figure.where' || where.args.length !== 1 || kind?.kind !== 'Ident') return 'other';
	return kind.value === 'image' ? 'figures' : kind.value === 'table' ? 'tables' : 'other';
}

function titleOf(title: CallArg | null): OutlineTitle | null {
	if (!title || title.kind === 'Auto') return { kind: 'auto' };
	if (title.kind === 'None') return { kind: 'none' };
	if (title.kind === 'Str') return { kind: 'written', text: unquote(title.value), quoted: true };
	return title.kind === 'ContentBlock' ? { kind: 'written', text: blockMarkup(title), quoted: false } : null;
}

function outlineOf(call: TypstCall | null): OutlineCall | null {
	if (!call || call.form !== 'call' || call.name !== 'outline' || call.bodies.length || call.args.some((arg) => arg.name === null))
		return null;
	const title = titleOf(namedArg(call, 'title'));
	const depth = namedArg(call, 'depth');
	if (!title || (depth && depth.kind !== 'Int' && depth.kind !== 'None')) return null;
	return { shows: showsOf(namedArg(call, 'target')), title, depth: depth?.kind === 'Int' ? Number(depth.value) : null };
}

export function readOutline(source: string): OutlineCall | null {
	return outlineOf(readTypstCall(source));
}

function sameTitle(a: OutlineTitle, b: OutlineTitle): boolean {
	return a.kind === b.kind && (a.kind !== 'written' || (b.kind === 'written' && a.text === b.text && a.quoted === b.quoted));
}

function titleValue(title: OutlineTitle): string | null {
	if (title.kind === 'auto') return null;
	if (title.kind === 'none') return 'none';
	return title.quoted ? typStr(title.text) : `[${title.text}]`;
}

/** the outline with `next` set, or null while a written title would not stand (a bracket not yet closed) */
export function writeOutline(source: string, next: Partial<OutlineCall>): string | null {
	const call = readTypstCall(source);
	const current = outlineOf(call);
	if (!call || !current) return null;
	const named: Record<string, string | null> = {};
	if (next.shows && next.shows !== 'other' && next.shows !== current.shows) named.target = TARGETS[next.shows];
	if (next.title && !sameTitle(next.title, current.title)) named.title = titleValue(next.title);
	if (next.depth !== undefined && next.depth !== current.depth) named.depth = next.depth === null ? null : String(next.depth);
	const written = rewrittenCall(call, { named });
	const read = readOutline(written);
	const title = read?.title;
	if (next.title?.kind === 'written' && (title?.kind !== 'written' || title.text !== next.title.text)) return null;
	return read ? written : null;
}
