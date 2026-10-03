// a suggestion is a comment thread carrying the words it took out
import type { Node as PMNode } from 'prosemirror-model';
import type { CommentEvent, CommentMessage, CommentThread } from './log';
import type { RegionParser } from '$lib/editor/visual/sourceSpans';
import { m } from '$lib/paraglide/messages';

export type SuggestionKind = 'replace' | 'insert' | 'delete';

/** the same words with other formatting; `added` and `removed` name what changed, when the words say */
export type FormatChange = { words: string; added: string[]; removed: string[] };

const FORMAT_NAMES = new Map([
	['strong', 'bold'],
	['em', 'italic'],
	['u', 'underline'],
	['code', 'code'],
	['sup', 'superscript'],
	['sub', 'subscript'],
	['s', 'strikethrough'],
	['strike', 'strikethrough'],
	['link', 'link'],
	['textcolor', 'color'],
	['highlight', 'highlight']
]);

function wordsOf(doc: PMNode): string {
	let out = '';
	doc.descendants((node) => {
		if (node.isText) out += node.text;
		else if (node.isInline) out += '￼';
		else if (node.isBlock && out && !out.endsWith('\n')) out += '\n';
		return !node.isInline;
	});
	return out.trim();
}

function formatsOf(doc: PMNode): Set<string> {
	const names = new Set<string>();
	doc.descendants((node) => {
		for (const mark of node.marks) names.add(FORMAT_NAMES.get(mark.type.name) ?? mark.type.name);
	});
	return names;
}

/** the same words read through the file's own parser with other formatting, or null when more changed */
export function formatChange(quote: string, restore: string, parse: RegionParser | null): FormatChange | null {
	if (!parse || !quote || !restore) return null;
	const fresh = parse(quote).doc;
	const gone = parse(restore).doc;
	const words = wordsOf(fresh);
	if (!words || words !== wordsOf(gone)) return null;
	const now = formatsOf(fresh);
	const was = formatsOf(gone);
	// another spelling of the same letters is not formatting
	if (!now.size && !was.size) return null;
	return { words, added: [...now].filter((n) => !was.has(n)), removed: [...was].filter((n) => !now.has(n)) };
}

export function isSuggestion(t: CommentThread): boolean {
	return t.restore !== undefined;
}

export function isOpenSuggestion(t: CommentThread): boolean {
	return isSuggestion(t) && !t.resolved;
}

/** a suggestion's own message goes only with an accept or a reject */
export function canDeleteMessage(t: CommentThread, msg: CommentMessage): boolean {
	return !isSuggestion(t) || t.messages[0]?.id !== msg.id;
}

export function suggestionKind(quote: string, restore: string): SuggestionKind {
	if (quote && restore) return 'replace';
	return quote ? 'insert' : 'delete';
}

export function suggestionAuthor(t: CommentThread): string {
	return t.messages[0]?.by ?? '';
}

export function spotRanks(placed: { id: string; from: number; to: number }[]): Map<string, number> {
	const ranks = new Map<string, number>();
	for (let i = 0; i < placed.length;) {
		let j = i;
		while (j < placed.length && placed[j].from === placed[i].from && placed[j].to === placed[j].from) j++;
		if (j - i > 1) for (let k = i; k < j; k++) ranks.set(placed[k].id, k - i);
		i = Math.max(j, i + 1);
	}
	return ranks;
}

export function shownWords(words: string): string {
	if (!words || /\S/.test(words)) return words;
	// a break has no glyph a reader already knows, so it is named. Spaces and tabs keep theirs: those
	// are ordinary in a diff and say how many there were
	if (/\n[ \t]*\n/.test(words)) return m.comments_suggest_paragraph_break();
	if (words.includes('\n')) return m.comments_suggest_line_break();
	return words.replace(/\t/g, '⇥').replace(/ /g, '·');
}

/** an event whose effect on the open file is more than one comment's range */
export function touchesSuggestions(e: CommentEvent, before: CommentThread[], events: CommentEvent[]): boolean {
	if (e.t === 'move' || e.t === 'delete-message') return true;
	if (e.t === 'edit') return false;
	const id = e.t === 'open' ? e.id : e.thread;
	return before.some((t) => t.id === id && isSuggestion(t)) || events.some((x) => x.t === 'open' && x.id === id && x.restore !== undefined);
}
