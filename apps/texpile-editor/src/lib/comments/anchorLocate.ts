// Finding the text an MCP caller names, so a new anchor is built from what is really in the file.
// Exact first, then the normalized form so a quote copied off a wrapped .tex line still lands;
// copies that tie are reported back, never guessed between (same policy as anchorSearch)
import { buildAnchor, contextScore, MAX_HITS, MIN_QUOTE, occurrences, type CommentAnchor } from './anchorSearch';
import { normalizeForMatch, type AnchorDialect } from './anchorNormalize';

export type LocateRequest = {
	quote: string;
	/** text expected right before / after the quote, to pick between copies */
	prefix?: string;
	suffix?: string;
	/** 1-based line the quote starts on, the other way to pick */
	line?: number;
};

export type LocateResult =
	| { ok: true; from: number; to: number; anchor: CommentAnchor }
	/** candidates: 1-based start lines of the copies, when the quote is ambiguous */
	| { ok: false; reason: string; candidates?: number[] };

type Hit = { from: number; to: number };

export function locateQuote(text: string, req: LocateRequest, dialect: AnchorDialect = 'tex'): LocateResult {
	const quote = req.quote;
	if (quote.length < MIN_QUOTE) return { ok: false, reason: `the quote is too short to place (under ${MIN_QUOTE} characters)` };
	let hits: Hit[] = occurrences(text, quote).map((at) => ({ from: at, to: at + quote.length }));
	if (hits.length === 0) hits = normalizedHits(text, quote, dialect);
	if (hits.length === 0) return { ok: false, reason: 'the quote was not found in the file' };
	if (hits.length >= MAX_HITS) return { ok: false, reason: 'the quote is too common in this file to pin a thread to' };
	if (hits.length > 1 && (req.prefix || req.suffix)) hits = bestContext(text, hits, req.prefix ?? '', req.suffix ?? '');
	if (hits.length > 1 && req.line) {
		const onLine = hits.filter((h) => lineOf(text, h.from) === req.line);
		if (onLine.length > 0) hits = onLine;
	}
	if (hits.length > 1)
		return {
			ok: false,
			reason: `the quote appears ${hits.length} times; pass prefix, suffix or line to pick one`,
			candidates: hits.slice(0, 20).map((h) => lineOf(text, h.from))
		};
	const [h] = hits;
	return { ok: true, from: h.from, to: h.to, anchor: buildAnchor(text, h.from, h.to) };
}

/** the same search in canonical space, mapped back to raw offsets; see anchorLoose */
function normalizedHits(text: string, quote: string, dialect: AnchorDialect): Hit[] {
	const q = normalizeForMatch(quote, dialect).text;
	if (q.length < MIN_QUOTE) return [];
	const n = normalizeForMatch(text, dialect);
	return occurrences(n.text, q).map((at) => ({
		from: n.map[at],
		to: at + q.length < n.map.length ? n.map[at + q.length] : text.length
	}));
}

/** the copies whose surroundings match the caller's context best; all of them when they tie */
function bestContext(text: string, hits: Hit[], prefix: string, suffix: string): Hit[] {
	let best = -1;
	let keep: Hit[] = [];
	for (const h of hits) {
		const score = contextScore(text, h.from, h.to, { prefix, suffix });
		if (score > best) {
			best = score;
			keep = [h];
		} else if (score === best) keep.push(h);
	}
	return keep;
}

/** 1-based line containing `offset` */
export function lineOf(text: string, offset: number): number {
	let line = 1;
	for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++;
	return line;
}
