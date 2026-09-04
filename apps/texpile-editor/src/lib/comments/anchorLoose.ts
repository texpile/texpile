// loose anchoring: resolveAnchor across dialect boundaries, plus the block downgrade for
// quotes that cannot be matched whole
import {
	buildAnchor,
	CONTEXT,
	MIN_QUOTE,
	resolveAnchor,
	searchQuote,
	WEAK_CONTEXT,
	type CommentAnchor,
	type ResolvedAnchor
} from './anchorSearch';
import { normalizeForMatch, type AnchorDialect } from './anchorNormalize';

/**
 * One text, normalized once, ready to be searched by many anchors.
 *
 * Exists because normalizing is the expensive half and the text is the same for every thread in a
 * file: it walks the whole string character by character building a parallel offset map, ~3ms for a
 * 200KB document. Doing that per THREAD made a file with 50 relocated comments cost 150ms instead
 * of 5 - the same work 50 times over, for one answer that never changes.
 */
export type LooseHaystack = {
	/** the original string, so a hit can be mapped back to offsets the caller can use */
	raw: string;
	text: string;
	map: number[];
	/** the dialect the haystack was normalized with; anchors must be normalized to match */
	dialect: AnchorDialect;
};

export function prepareLoose(text: string, dialect: AnchorDialect = 'tex'): LooseHaystack {
	const n = normalizeForMatch(text, dialect);
	return { raw: text, text: n.text, map: n.map, dialect };
}

/**
 * resolveAnchor across dialects: the anchor was written against one form of the text (usually the
 * source file) and is being placed in another (the rendered document), so both sides go through
 * normalizeForMatch and the match happens in canonical space. The result is mapped back to RAW
 * offsets in `h.raw`.
 *
 * Never exact: the raw fast path cannot apply when the offsets belong to a different string. The
 * hint is 0 for the same reason - a source offset points nowhere in particular here, so ties fall
 * to the earliest copy rather than to a number pretending to be relevant.
 *
 * The anchor's own quote/prefix/suffix are still normalized per call, and stay that way: they are
 * at most a sentence and a pair of 32-character windows, and they differ every time.
 */
export function resolveAnchorLooseIn(h: LooseHaystack, a: CommentAnchor): ResolvedAnchor | null {
	const quote = normalizeForMatch(a.quote, h.dialect).text;
	const hit = searchQuote(h.text, quote, normalizeForMatch(a.prefix, h.dialect).text, normalizeForMatch(a.suffix, h.dialect).text, 0);
	if (!hit) return null;
	const from = h.map[hit.from];
	const to = hit.to < h.map.length ? h.map[hit.to] : h.raw.length;
	return { from, to, exact: false, weak: hit.context < WEAK_CONTEXT };
}

/** the single-anchor form; callers with a list should prepare once and loop resolveAnchorLooseIn */
export function resolveAnchorLoose(text: string, a: CommentAnchor, dialect: AnchorDialect = 'tex'): ResolvedAnchor | null {
	return resolveAnchorLooseIn(prepareLoose(text, dialect), a);
}

// block downgrade: locate a quote that cannot be matched whole

/**
 * Spans of a quote with no textual counterpart on the other side of the dialect boundary, used to
 * SPLIT the quote into locatable fragments. U+FFFC is the rendered side's atom placeholder; the
 * rest is the source syntax of the same atoms - math, citations, references, labels - per
 * dialect. Closed patterns on purpose: a span these miss just yields a shorter fragment.
 */
const ATOM_SYNTAX: Record<AnchorDialect, string> = {
	tex: '￼|\\$[^$]*\\$|\\\\\\((?:[^\\\\]|\\\\[^)])*?\\\\\\)|\\\\\\[(?:[^\\\\]|\\\\[^\\]])*?\\\\\\]|\\\\[a-zA-Z]+\\*?(?:\\[[^\\]]*\\])?(?:\\{[^{}]*\\})+',
	md: '￼|!\\[[^\\]]*\\]\\([^)]*\\)|`[^`]+`|\\$[^$]*\\$|&#?[a-zA-Z0-9]{2,10};|</?[a-zA-Z][^>\\n]{0,80}>',
	typ: '￼|\\$[^$]*\\$|@[\\w:.-]+|#[a-zA-Z_][\\w.]*(?:\\([^()]*\\))?|<[a-zA-Z_][\\w:.-]*>'
};

/**
 * Find WHERE a quote lives when the quote itself cannot: split it at atom spans AND at block
 * boundaries (the newlines flattenDoc put between blocks), and resolve each fragment with the
 * quote's own surrounding text as context. The newline split is what makes the fallback general:
 * whatever construct broke the whole-quote match, some block of the selection is usually plain
 * enough to place.
 *
 * The result SPANS every fragment that resolved, first hit to last - a selection across three
 * paragraphs downgrades to all three, not just the one its longest piece is in. That trust only
 * holds while the hits land in the quote's own order; out-of-order hits mean some fragment
 * matched a lookalike elsewhere, and then only the longest fragment's hit is believed.
 */
export function resolveFragment(h: LooseHaystack, quote: string): ResolvedAnchor | null {
	const split = new RegExp(ATOM_SYNTAX[h.dialect] + '|\\n+', 'g');
	const frags: { text: string; at: number }[] = [];
	let last = 0;
	for (let m = split.exec(quote); m !== null; m = split.exec(quote)) {
		if (m.index > last) frags.push({ text: quote.slice(last, m.index), at: last });
		last = m.index + (m[0].length || 1);
	}
	if (last < quote.length) frags.push({ text: quote.slice(last), at: last });
	if (frags.length === 1 && frags[0].at === 0 && frags[0].text === quote) return null; // nothing to split: the whole quote already missed
	function resolve(f: { text: string; at: number }) {
		return resolveAnchorLooseIn(h, {
			quote: f.text,
			prefix: quote.slice(Math.max(0, f.at - CONTEXT), f.at),
			suffix: quote.slice(f.at + f.text.length, f.at + f.text.length + CONTEXT),
			start: 0,
			end: 0
		});
	}
	const hits: ResolvedAnchor[] = [];
	let longest: { hit: ResolvedAnchor; len: number } | null = null;
	for (const f of frags) {
		if (f.text.trim().length < MIN_QUOTE) continue;
		const hit = resolve(f);
		if (!hit) continue;
		hits.push(hit);
		if (!longest || f.text.length > longest.len) longest = { hit, len: f.text.length };
	}
	if (!hits.length) return null;
	const ordered = hits.every((x, i) => i === 0 || x.from >= hits[i - 1].from);
	if (ordered) return { from: hits[0].from, to: Math.max(...hits.map((x) => x.to)), exact: false, weak: hits.some((x) => x.weak) };
	return longest!.hit;
}

/**
 * The whole creation-time conversion: a rendered-dialect anchor (from a visual editor) becomes a
 * SOURCE-dialect one - precise when the quote survives the dialect boundary, the enclosing block
 * when only a fragment does, unchanged (detached) when nothing at all is locatable. Lives here
 * rather than in the controller so it is a pure function tests can hammer with generated
 * selections.
 */
export function toSourceAnchor(
	text: string,
	dialect: AnchorDialect,
	a: CommentAnchor
): { anchor: CommentAnchor; tier: 'precise' | 'block' | 'detached' } {
	const hay = prepareLoose(text, dialect);
	const hit = resolveAnchor(text, a) ?? resolveAnchorLooseIn(hay, a);
	if (hit) return { anchor: buildAnchor(text, hit.from, hit.to), tier: 'precise' };
	const frag = resolveFragment(hay, a.quote);
	if (frag) {
		const b = blockBounds(text, frag.from, frag.to);
		if (b.to > b.from) return { anchor: buildAnchor(text, b.from, b.to), tier: 'block' };
	}
	return { anchor: a, tier: 'detached' };
}

/**
 * The enclosing source block of a range: expanded to blank-line boundaries, edges trimmed. The
 * unit a fragment-located comment downgrades to - blank lines delimit paragraphs in every dialect
 * this app edits, so the rule needs no parser and cannot lie by much.
 */
export function blockBounds(text: string, from: number, to: number): { from: number; to: number } {
	let start = 0;
	{
		let lineStart = text.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
		while (lineStart > 0) {
			const prevStart = text.lastIndexOf('\n', lineStart - 2) + 1;
			if (!text.slice(prevStart, lineStart - 1).trim()) {
				start = lineStart;
				break;
			}
			lineStart = prevStart;
		}
	}
	let end = text.length;
	{
		let lineEnd = text.indexOf('\n', to);
		while (lineEnd !== -1) {
			const nextEnd = text.indexOf('\n', lineEnd + 1);
			if (!text.slice(lineEnd + 1, nextEnd === -1 ? text.length : nextEnd).trim()) {
				end = lineEnd;
				break;
			}
			lineEnd = nextEnd;
		}
	}
	while (start < end && /\s/.test(text[start])) start++;
	while (end > start && /\s/.test(text[end - 1])) end--;
	return { from: start, to: end };
}
