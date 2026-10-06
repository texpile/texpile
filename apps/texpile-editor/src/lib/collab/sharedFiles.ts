// Which workspace files a session shares, and how: text co-edits through the CRDT, everything else
// goes as name plus bytes on demand. Also the transaction origins every side tells changes apart by.

import type * as Y from 'yjs';
import { LATEX_SIDECAR_RE } from '$lib/workspace/buildArtifacts';
import { carryGestures, type TextSpan } from '$lib/comments/editGestures';
import type { ManifestEntry } from './session';

// Which files co-edit as CRDT text is decided by CONTENT (decodeIfText below), not by an
// extension list: the old allow-list silently locked guests out of every file of a type nobody
// remembered to add - .typ sat missing for the whole life of typst support. Only two things
// still gate it: generated artifacts (below) and the size caps.
//
// Generated build products are rewritten wholesale by every compile, and a Y.Doc keeps history -
// routing them through the CRDT would grow every participant's session memory with dead compile
// output. They stay in the fetch-on-demand binary tier (guests still get the log and friends).
const GENERATED_EXT = LATEX_SIDECAR_RE;
// never shared: anything hidden (.git, .env, .npmrc) and dependency trees (credentials + noise). Everything
// else is shared, gated by size, so a guest can pull the output folder for local intellisense, the log, and the PDF.
const EXCLUDE = /(^|\/)(\.[^/]*|node_modules|__pycache__)(\/|$)/i;
// Name-based HINT that a file is source text, where content is not worth reading: the too-big-to-
// co-edit warning, and the tree scan's "text needs no stat" fast path. Never used to DENY co-edit.
const LIKELY_TEXT = /\.(tex|bib|cls|sty|txt|md|csv|dat|def|tikz|pgf|json|yml|yaml|toml|lco|ldf|clo|bst|typ)$/i;

export function isShared(rel: string) {
	return !EXCLUDE.test(rel);
}
export function isGeneratedArtifact(rel: string) {
	return GENERATED_EXT.test(rel);
}
export function isLikelyTextName(rel: string) {
	return LIKELY_TEXT.test(rel);
}

/**
 * The decoded text of `bytes`, or null when they are not losslessly text: a NUL in the first 8 KB
 * (the classic binary tell) or any invalid UTF-8. Lossless matters because this exact string is
 * what the materializer writes BACK to disk - a lossy decode of a PNG would corrupt the file on
 * the first write-through.
 */
export function decodeIfText(bytes: Uint8Array): string | null {
	const probe = Math.min(bytes.length, 8192);
	for (let i = 0; i < probe; i++) if (bytes[i] === 0) return null;
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

// co-edit cap; larger text is shared as binary (name + on-demand bytes). Frames are gzipped before
// they hit the relay (session.ts), and LaTeX compresses ~4x, so a file up to this size still clears
// the relay's per-message cap. Anything past it is view-only, and seed() reports it so the host can warn.
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_BINARY_BYTES = 100 * 1024 * 1024; // a binary/artifact larger than this isn't shared (guest-RAM guard)

export const SEED_ORIGIN = 'collab-seed';
export const EDIT_ORIGIN = 'collab-edit'; // a local editor's fold-in splice (host or guest)
/** the file changed on disk and the buffer took it in: undoable, never written back */
export const DISK_ORIGIN = 'disk';

// the shared set as a stable string: which paths exist and their kind, ignoring a binary's rev
// (an image reswap doesn't change any source binding) and lock state (that's a live read-only flip)
export function manifestSignature(manifest: Y.Map<ManifestEntry>): string {
	const parts: string[] = [];
	for (const [rel, e] of manifest.entries()) parts.push(`${rel}:${e.kind}:${e.gone ? 1 : 0}`);
	return parts.sort().join('|');
}

/** where a Y.Text change landed, as spans of the text after it; a deletion is an empty span */
export function changedSpans(delta: Y.YTextEvent['delta'], before: string, after: string): TextSpan[] {
	const spans = deltaSpans(delta);
	// one edit is placed from the text, as a local one is: the writer's splice is one of several places it
	// could have gone, and the visual editor's puts a letter typed beside the same letter after it
	return spans.length === 1 ? carryGestures([], before, after) : spans;
}

function deltaSpans(delta: Y.YTextEvent['delta']): TextSpan[] {
	const out: TextSpan[] = [];
	let at = 0;
	for (const op of delta) {
		if (op.retain) at += op.retain;
		else if (op.insert !== undefined) {
			const to = at + (typeof op.insert === 'string' ? op.insert.length : 1);
			out.push({ from: at, to });
			at = to;
		} else if (op.delete) out.push({ from: at, to: at });
	}
	const merged: TextSpan[] = [];
	for (const g of out) {
		const prev = merged[merged.length - 1];
		if (prev && g.from <= prev.to) prev.to = Math.max(prev.to, g.to);
		else merged.push({ ...g });
	}
	return merged;
}
