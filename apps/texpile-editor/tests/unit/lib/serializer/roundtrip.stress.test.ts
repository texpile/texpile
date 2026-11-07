/**
 * Round-trip stress harness over real-world LaTeX (e.g. arXiv source), the regression oracle
 * for the parser/serializer. Per file: parse + serialize don't crash; the round-trip converges
 * (R1 === R2 after the first normalizing pass, divergence means the editor would churn the file
 * on every save); and a fidelity signal (raw-demotion counts + prose-word preservation).
 * Writes a full report to <CORPUS_DIR>/../report/.
 *
 * Inert unless CORPUS_DIR points at a folder of .tex files:
 *
 *   CORPUS_DIR=/path/to/corpus pnpm --filter texpile-editor exec vitest run roundtrip.stress
 *
 * CORPUS_TABLE=1 parses each file with the package table its class and packages give, as the app does (beamer decks
 * read their frames, blocks and overlays through it); without it every file reads the common table.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Node } from 'prosemirror-model';
import { parseLatexFile, serializeLatexFile, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import { parsedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { packageTableOf } from '$lib/languages/latex/parser/signatures/packageTable';
import { Fragment } from 'prosemirror-model';
import { compareSuggestions } from '$lib/comments/suggestCompare';

const CORPUS = process.env.CORPUS_DIR;
const HOOK_TIMEOUT_MS = 30 * 60 * 1000;
const WITH_TABLE = process.env.CORPUS_TABLE === '1';

function listTex(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listTex(full));
		else if (entry.isFile() && entry.name.endsWith('.tex')) out.push(full);
	}
	return out;
}

function countDescendants(doc: Node, pred: (n: Node) => boolean): number {
	let n = 0;
	doc.descendants((node) => {
		if (pred(node)) n++;
		return true;
	});
	return n;
}

function totalNodes(doc: Node): number {
	let n = 0;
	doc.descendants(() => {
		n++;
		return true;
	});
	return n;
}

/** strip LaTeX line comments (`%` to EOL, but not escaped `\%`) */
function stripComments(s: string): string {
	return s.replace(/(^|[^\\])%[^\n]*/g, '$1');
}

/**
 * coarse prose tokens: alphabetic runs of length >= 3, lowercased (multiset). LaTeX command
 * tokens are stripped first so this measures the author's prose, not command names (otherwise
 * a macro-definition file looks like total loss).
 */
function words(s: string): Map<string, number> {
	const m = new Map<string, number>();
	const prose = s.replace(/\\[a-zA-Z]+\*?/g, ' ');
	for (const w of prose.toLowerCase().match(/[a-z]{3,}/g) ?? []) m.set(w, (m.get(w) ?? 0) + 1);
	return m;
}

/** fraction of source prose-word occurrences still present in R1 (1 = nothing dropped) */
function wordPreservation(srcBody: string, r1: string): { ratio: number; missing: string[] } {
	const a = words(srcBody);
	const b = words(r1);
	let total = 0;
	let kept = 0;
	const missing: string[] = [];
	for (const [w, c] of a) {
		total += c;
		const have = Math.min(c, b.get(w) ?? 0);
		kept += have;
		if (have < c) missing.push(`${w}(-${c - have})`);
	}
	return { ratio: total === 0 ? 1 : kept / total, missing: missing.slice(0, 40) };
}

function firstStringDiff(a: string, b: string, label: string): string | null {
	if (a === b) return null;
	let i = 0;
	const max = Math.min(a.length, b.length);
	while (i < max && a[i] === b[i]) i++;
	return `[${label}] @${i}: <<${JSON.stringify(a.slice(i, i + 80))}>> <<${JSON.stringify(b.slice(i, i + 80))}>>`;
}

interface FileResult {
	file: string;
	bytes: number;
	crash: string | null;
	// pass at which the round-trip reaches a fixed point: 1 = R1===R2 (stable on the first save),
	// 2/3 = settles after a benign one-time normalisation, 0 = never settles within 4 passes
	convergedAt: number;
	// of the non-settling files: true = bounded period-2 oscillation (R2===R4, content intact).
	// false with convergedAt 0 = genuine divergence, the dangerous compounding kind.
	oscillating: boolean;
	grows: boolean; // output length strictly increases each pass: compounding corruption
	rawNodes: number;
	inlineLatexNodes: number;
	totalNodes: number;
	wordRatio: number;
	// suggestions: one word typed into a paragraph at a quarter, half and three quarters of the
	// document, the file diffed as Suggesting mode diffs it. `suggestExact` counts the edits that
	// yield exactly one suggestion covering exactly the typed word, `suggestEdits` the edits made
	suggestEdits: number;
	suggestExact: number;
	missingWords: string[];
	firstDiff: string | null;
	// untouched-save fidelity (the verbatim layer): a no-edit save (R1) must equal the source
	// byte-for-byte. strictly stronger than convergence: byteIdentical proves pass 1 changed
	// nothing, so the compiled PDF is provably unaffected.
	byteIdentical: boolean;
	// when not byte-identical, how it differs, ordered by render safety:
	//  'inert-whitespace': only intra-paragraph whitespace/wrapping changed; provably
	//    render-neutral by TeX tokenization rules, no compile needed to clear it.
	//  'structural-whitespace': the blank-line structure moved (a blank line is a \par: a
	//    paragraph break, or fatal inside a non-\long macro argument), or a verbatim-env span
	//    changed whitespace. text-level judgment cannot clear these, they need the compile/pixel
	//    oracle (this class held the old binary classifier's proven false negative).
	//  'content': a real character changed. always a bug; hard-gated to zero.
	diffKind: 'identical' | 'inert-whitespace' | 'structural-whitespace' | 'content';
	firstByteDiff: string | null;
	// top-level doc children that are raw_latex blocks: the block-level "demoted to raw" count
	rawBlocksTop: number;
	// fraction of top-level body blocks the parse could place (their bytes known).
	// low coverage explains a non-identical result without opening the file: the gap is in which
	// constructs get spans, not in the substitution logic.
	origCoverage: number;
	origBlocks: number;
	totalBlocks: number;
	// blocks whose leaf runs contradicted their bytes at load: not placed, written afresh even
	// untouched (see MapDefect). each one names a parser position bug. hard-gated to zero
	mapDefects: number;
	firstDefect: string | null;
	// doc.check() failure or null. lenient builders (NodeType.create) can emit schema-invalid
	// nodes; the doc loads and serializes fine but the first structural edit throws and freezes
	// ProseMirror. hard-gated to zero.
	schemaViolation: string | null;
}

/**
 * collapse whitespace runs to a single space for equality comparison, also inserting a space
 * before a `\` not already preceded by whitespace: control words end at the first non-letter,
 * so `\foo\bar` and `\foo \bar` are token-identical to TeX. without this the serializer's
 * mandatory `\n\n` glue between a regenerated block and a following verbatim one would get
 * misclassified as a content change. both replacements are lexical tokenizer rules; the output
 * is never emitted.
 */
function collapseWs(s: string): string {
	return s
		.replace(/([^\s])\\/g, '$1 \\')
		.replace(/\s+/g, ' ')
		.trim();
}

/** paragraph decomposition for the render-safety classifier: split on blank-line boundaries
 *  (the \par positions TeX sees), then collapse intra-paragraph whitespace. equal decompositions
 *  differ only in intra-paragraph spacing/wrapping: render-neutral. calibrated against the pixel
 *  oracle (crossref.py in the render_diff harness). the split pattern is TeX's own definition of
 *  a paragraph break, a purely lexical notion, so the split is exact, not an approximation. */
function paragraphUnits(s: string): string[] {
	return s
		.replace(/\r\n/g, '\n')
		.split(/\n[ \t]*\n[\s]*/)
		.map((p) => collapseWs(p))
		.filter((p) => p !== '');
}

/** byte-exact spans of whitespace-significant environments (verbatim family + tikz), in order.
 *  whitespace inside these is not inert, so the classifier must not clear a file whose verbatim
 *  spans drifted. the verbatim family cannot nest itself, so the lazy regex is exact; a missed
 *  span can only demote a verdict toward the render oracle, never clear one. */
const VERBATIM_SPAN_RE = /\\begin\{(verbatim\*?|lstlisting|minted|alltt|filecontents\*?|tikzpicture)\}[\s\S]*?\\end\{\1\}/g;
function verbatimSpans(s: string): string[] {
	return s.match(VERBATIM_SPAN_RE) ?? [];
}

/** render-safety verdict for a non-byte-identical untouched save */
function classifyDiff(src: string, r1: string): 'inert-whitespace' | 'structural-whitespace' | 'content' {
	if (collapseWs(src) !== collapseWs(r1)) return 'content';
	const sameParas = JSON.stringify(paragraphUnits(src)) === JSON.stringify(paragraphUnits(r1));
	const sameVerbatim = JSON.stringify(verbatimSpans(src)) === JSON.stringify(verbatimSpans(r1));
	return sameParas && sameVerbatim ? 'inert-whitespace' : 'structural-whitespace';
}

/** the paragraph at top-level index `i` with ' zq' typed after its first word, or null */
function typedInto(doc: Node, i: number): Node | null {
	const block = doc.child(i);
	if (block.type.name !== 'paragraph') return null;
	const kids: Node[] = [];
	let done = false;
	block.forEach((c) => {
		if (!done && c.isText && c.text!.trim().length > 3) {
			kids.push(c.type.schema.text(c.text!.replace(/(\S+)/, '$1 zq'), c.marks));
			done = true;
		} else kids.push(c);
	});
	if (!done) return null;
	const fresh = block.type.create(block.attrs, Fragment.fromArray(kids), block.marks);
	const top: Node[] = [];
	doc.forEach((c, _o, k) => top.push(k === i ? fresh : c));
	return doc.type.create(doc.attrs, Fragment.fromArray(top), doc.marks);
}

/** how many one-word edits Suggesting mode would show as exactly that word */
function suggestionPrecision(src: string, parsed: ParsedLatexFile): { edits: number; exact: number } {
	const n = parsed.doc.childCount;
	let edits = 0;
	let exact = 0;
	let id = 0;
	for (const i of new Set([Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)])) {
		const edited = typedInto(parsed.doc, i);
		if (!edited) continue;
		let after: string;
		try {
			after = serializeLatexFile(parsed, edited);
		} catch {
			continue;
		}
		if (after === src) continue;
		edits++;
		const { placed } = compareSuggestions({ before: src, after, pending: [], mode: 'suggesting', author: 'me', newId: () => String(++id) });
		if (placed.length === 1 && after.slice(placed[0].from, placed[0].to).trim() === 'zq' && placed[0].restore.trim() === '') exact++;
	}
	return { edits, exact };
}

function origCoverageOf(parsed: ParsedLatexFile): { coverage: number; withOrig: number; total: number } {
	let withOrig = 0;
	const total = parsed.doc.childCount;
	for (const o of parsed.origins.origins) if (typeof o.text === 'string') withOrig++;
	return { coverage: total === 0 ? 1 : withOrig / total, withOrig, total };
}

const results: FileResult[] = [];

describe('stress: real LaTeX round-trip', () => {
	if (!CORPUS || !fs.existsSync(CORPUS)) {
		it('skipped — set CORPUS_DIR to a folder of .tex files', () => {
			expect(true).toBe(true);
		});
		return;
	}

	const files = listTex(CORPUS);
	const reportDir = path.join(CORPUS, '..', 'report');
	const debugDir = path.join(reportDir, 'pairs');

	beforeAll(async () => {
		fs.mkdirSync(debugDir, { recursive: true });
		for (const file of files) {
			const rel = path.relative(CORPUS, file).replace(/[\\/]/g, '__');
			const r: FileResult = {
				file: path.relative(CORPUS, file),
				bytes: 0,
				crash: null,
				convergedAt: 0,
				oscillating: false,
				grows: false,
				rawNodes: 0,
				inlineLatexNodes: 0,
				totalNodes: 0,
				wordRatio: 1,
				suggestEdits: 0,
				suggestExact: 0,
				missingWords: [],
				firstDiff: null,
				byteIdentical: false,
				diffKind: 'content',
				firstByteDiff: null,
				rawBlocksTop: 0,
				origCoverage: 0,
				origBlocks: 0,
				totalBlocks: 0,
				mapDefects: 0,
				firstDefect: null,
				schemaViolation: null
			};
			try {
				const src = fs.readFileSync(file, 'utf8');
				r.bytes = src.length;
				const table = WITH_TABLE ? packageTableOf(await parsedPackages(src)) : undefined;
				const parse = (text: string) => parseLatexFile(text, '', undefined, table);
				const p1 = parse(src);
				const r1 = serializeLatexFile(p1, p1.doc);
				const p2 = parse(r1);
				const r2 = serializeLatexFile(p2, p2.doc);
				const p3 = parse(r2);
				const r3 = serializeLatexFile(p3, p3.doc);
				const p4 = parse(r3);
				const r4 = serializeLatexFile(p4, p4.doc);

				try {
					p1.doc.check();
				} catch (e) {
					r.schemaViolation = e instanceof Error ? e.message : String(e);
				}

				r.rawNodes = countDescendants(p1.doc, (n) => n.type.name === 'raw_latex');
				r.inlineLatexNodes = countDescendants(p1.doc, (n) => n.type.name === 'inline_latex');
				r.totalNodes = totalNodes(p1.doc);
				r.convergedAt = r1 === r2 ? 1 : r2 === r3 ? 2 : r3 === r4 ? 3 : 0;

				// untouched-save byte-identity oracle
				r.byteIdentical = r1 === src;
				if (r.byteIdentical) {
					r.diffKind = 'identical';
				} else {
					r.diffKind = classifyDiff(src, r1);
					r.firstByteDiff = firstStringDiff(src, r1, 'src/R1');
				}
				r.mapDefects = p1.origins.defects.length;
				const d0 = p1.origins.defects[0];
				r.firstDefect = d0 ? `${d0.kind} ${d0.srcFrom}..${d0.srcTo}: ${d0.detail}` : null;
				const cov = origCoverageOf(p1);
				r.origCoverage = cov.coverage;
				r.origBlocks = cov.withOrig;
				r.totalBlocks = cov.total;
				for (let i = 0; i < p1.doc.childCount; i++) {
					if (p1.doc.child(i).type.name === 'raw_latex') r.rawBlocksTop++;
				}
				// bounded period-2 oscillation (content intact, a space flips) vs real divergence
				r.oscillating = r.convergedAt === 0 && r2 === r4;
				// compounding: output keeps getting longer each pass, the dangerous kind
				r.grows = r1.length < r2.length && r2.length < r3.length && r3.length < r4.length;

				// body of source for word comparison: between begin/end document if present
				const bi = src.indexOf('\\begin{document}');
				const ei = src.lastIndexOf('\\end{document}');
				const srcBody = bi >= 0 && ei > bi ? src.slice(bi + 16, ei) : src;
				// comments are not editor content (the parser strips them); compare only the
				// prose the editor is responsible for preserving
				const wp = wordPreservation(stripComments(srcBody), r1);
				r.wordRatio = wp.ratio;
				const sg = suggestionPrecision(src, p1);
				r.suggestEdits = sg.edits;
				r.suggestExact = sg.exact;
				r.missingWords = wp.missing;

				if (r.convergedAt !== 1) {
					// first divergence: settled-late compares R1/R2; never-settles compares the
					// last two passes, the persisting instability
					const [a, b, lbl] = r.convergedAt === 0 ? [r3, r4, 'R3/R4'] : [r1, r2, 'R1/R2'];
					let i = 0;
					const max = Math.min(a.length, b.length);
					while (i < max && a[i] === b[i]) i++;
					r.firstDiff = `[${lbl}] @${i}: <<${JSON.stringify(a.slice(i, i + 80))}>> <<${JSON.stringify(b.slice(i, i + 80))}>>`;
				}

				fs.writeFileSync(path.join(debugDir, rel + '.src.tex'), src);
				fs.writeFileSync(path.join(debugDir, rel + '.r1.tex'), r1);
				if (r.convergedAt !== 1) {
					fs.writeFileSync(path.join(debugDir, rel + '.r2.tex'), r2);
					fs.writeFileSync(path.join(debugDir, rel + '.r3.tex'), r3);
					fs.writeFileSync(path.join(debugDir, rel + '.r4.tex'), r4);
				}
			} catch (e) {
				r.crash = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
			}
			results.push(r);
		}

		const lines: string[] = [];
		lines.push('# Round-trip stress report\n');
		const settled = (r: FileResult) => !r.crash && r.convergedAt >= 1;
		const oscillating = (r: FileResult) => !r.crash && r.convergedAt === 0 && r.oscillating;
		const diverging = (r: FileResult) => !r.crash && r.convergedAt === 0 && !r.oscillating;
		const live = results.filter((r) => !r.crash);
		const avgCoverage = live.length ? live.reduce((s, r) => s + r.origCoverage, 0) / live.length : 0;
		lines.push(`files: ${results.length}`);
		lines.push(`crashes: ${results.filter((r) => r.crash).length}`);
		lines.push(`stable@pass1 (R1===R2, ideal): ${results.filter((r) => !r.crash && r.convergedAt === 1).length}`);
		lines.push(`stable@pass2-3 (settles after a benign normalisation): ${results.filter((r) => settled(r) && r.convergedAt > 1).length}`);
		lines.push(`oscillating (bounded ±1 space, content intact): ${results.filter(oscillating).length}`);
		lines.push(`DIVERGING / compounding (real bug): ${results.filter(diverging).length}`);
		lines.push('');
		lines.push('## Verbatim source preservation (untouched-save byte fidelity)\n');
		lines.push(`byte-identical (R1===src, no-edit save is a no-op): ${live.filter((r) => r.byteIdentical).length} / ${live.length}`);
		lines.push(
			`  inert-whitespace (intra-paragraph only — provably render-neutral, no compile needed): ${live.filter((r) => r.diffKind === 'inert-whitespace').length}`
		);
		lines.push(
			`  STRUCTURAL-whitespace (blank-line structure moved — needs the render oracle): ${live.filter((r) => r.diffKind === 'structural-whitespace').length}`
		);
		lines.push(`  CONTENT diff (investigate): ${live.filter((r) => r.diffKind === 'content').length}`);
		lines.push(`avg top-level block orig-coverage (span capture succeeded): ${(avgCoverage * 100).toFixed(1)}%`);
		lines.push(
			`files with map defects (a run contradicting its block's bytes; each one a parser position bug): ${live.filter((r) => r.mapDefects > 0).length} / ${live.length}, ${live.reduce((s, r) => s + r.mapDefects, 0)} blocks`
		);
		lines.push('');
		// editability metric: how much of each document is demoted to raw LaTeX vs modelled,
		// tracked at two granularities: top-level blocks (visible uneditable chunks) and all
		// nodes (including inline chips inside paragraphs)
		const sgEdits = live.reduce((s, r) => s + r.suggestEdits, 0);
		const sgExact = live.reduce((s, r) => s + r.suggestExact, 0);
		lines.push(
			`suggestions: one typed word shown as exactly that word: ${sgExact} / ${sgEdits} edits (${sgEdits ? ((100 * sgExact) / sgEdits).toFixed(0) : 0}%)`
		);
		lines.push('');
		const sumBlocks = live.reduce((s, r) => s + r.totalBlocks, 0);
		const sumRawTop = live.reduce((s, r) => s + r.rawBlocksTop, 0);
		const sumNodes = live.reduce((s, r) => s + r.totalNodes, 0);
		const sumRawish = live.reduce((s, r) => s + r.rawNodes + r.inlineLatexNodes, 0);
		lines.push('## Raw-demotion ratio (editability cost of the fidelity-first strategy)\n');
		lines.push(
			`top-level blocks demoted to raw_latex: ${sumRawTop} / ${sumBlocks} (${sumBlocks ? ((100 * sumRawTop) / sumBlocks).toFixed(1) : 0}%)`
		);
		lines.push(
			`all nodes that are raw/inline chips:  ${sumRawish} / ${sumNodes} (${sumNodes ? ((100 * sumRawish) / sumNodes).toFixed(1) : 0}%)`
		);
		lines.push(
			`files with >50% of blocks demoted: ${live.filter((r) => r.totalBlocks > 0 && r.rawBlocksTop / r.totalBlocks > 0.5).length} / ${live.length}` +
				` (usually macro-definition include files — correct to demote)`
		);
		lines.push('');
		lines.push(
			'| file | bytes | crash | stable@ | byte-ident | diffKind | origCov | rawTop/blocks | raw | inlineTex | nodes | wordRatio |'
		);
		lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
		for (const r of results) {
			const stable = r.convergedAt >= 1 ? String(r.convergedAt) : r.oscillating ? 'osc' : r.grows ? 'GROWS' : 'DIVERGE';
			lines.push(
				`| ${r.file} | ${r.bytes} | ${r.crash ? 'YES' : ''} | ${stable} | ${r.byteIdentical ? 'YES' : ''} | ${r.diffKind} | ${(r.origCoverage * 100).toFixed(0)}% (${r.origBlocks}/${r.totalBlocks}) | ${r.rawBlocksTop}/${r.totalBlocks} | ${r.rawNodes} | ${r.inlineLatexNodes} | ${r.totalNodes} | ${r.wordRatio.toFixed(3)} |`
			);
		}
		lines.push('\n## Map defects (blocks not believed at load)\n');
		for (const r of results.filter((x) => x.mapDefects > 0)) lines.push(`- ${r.file}: ${r.mapDefects}: ${r.firstDefect}`);
		lines.push('\n## Crashes\n');
		for (const r of results.filter((x) => x.crash)) lines.push(`### ${r.file}\n\n\`\`\`\n${r.crash}\n\`\`\`\n`);
		lines.push('\n## DIVERGING / compounding — real bugs (never settles, not a bounded oscillation)\n');
		for (const r of results.filter(diverging)) lines.push(`### ${r.file}${r.grows ? ' [GROWS]' : ''}\n\n${r.firstDiff}\n`);
		lines.push('\n## Oscillating — bounded ±1-space flip in raw-preserved blocks (content intact)\n');
		for (const r of results.filter(oscillating)) lines.push(`### ${r.file}\n\n${r.firstDiff}\n`);
		lines.push('\n## Stable@pass2-3 — benign one-time normalisation\n');
		for (const r of results.filter((x) => settled(x) && x.convergedAt > 1)) lines.push(`### ${r.file}\n\n${r.firstDiff}\n`);
		lines.push('\n## Low word preservation (<0.97)\n');
		for (const r of results.filter((x) => !x.crash && x.wordRatio < 0.97))
			lines.push(`### ${r.file} (${r.wordRatio.toFixed(3)})\nmissing: ${r.missingWords.join(' ')}\n`);
		lines.push('\n## CONTENT diffs on an untouched save (real bugs — highest priority)\n');
		for (const r of results.filter((x) => !x.crash && x.diffKind === 'content'))
			lines.push(
				`### ${r.file} (coverage ${(r.origCoverage * 100).toFixed(0)}%, ${r.origBlocks}/${r.totalBlocks})\n\n${r.firstByteDiff}\n`
			);
		lines.push('\n## STRUCTURAL whitespace diffs (blank-line structure moved — verify with the render oracle)\n');
		for (const r of results.filter((x) => !x.crash && x.diffKind === 'structural-whitespace'))
			lines.push(
				`### ${r.file} (coverage ${(r.origCoverage * 100).toFixed(0)}%, ${r.origBlocks}/${r.totalBlocks})\n\n${r.firstByteDiff}\n`
			);
		lines.push('\n## Inert whitespace diffs (intra-paragraph only — render-neutral, cleared by text diff)\n');
		for (const r of results.filter((x) => !x.crash && x.diffKind === 'inert-whitespace'))
			lines.push(
				`### ${r.file} (coverage ${(r.origCoverage * 100).toFixed(0)}%, ${r.origBlocks}/${r.totalBlocks})\n\n${r.firstByteDiff}\n`
			);

		fs.writeFileSync(path.join(reportDir, 'report.md'), lines.join('\n'));
		fs.writeFileSync(path.join(reportDir, 'report.json'), JSON.stringify(results, null, 2));
		// echo the summary so it shows in test output
		console.log('\n' + lines.slice(0, 24).join('\n') + '\n');
		// a real corpus is minutes of parsing, and vitest's 10s default killed this hook before it
		// graded a single file: the suite reported a hook timeout instead of a verdict
	}, HOOK_TIMEOUT_MS);

	it('no parse/serialize crashes', () => {
		const crashed = results.filter((r) => r.crash).map((r) => r.file);
		expect(crashed).toEqual([]);
	});

	it('every parsed doc satisfies the schema content model (doc.check())', () => {
		// a violating doc renders and serializes fine but freezes the editor on the first
		// structural edit; this gate catches every lenient-create invalidity class
		const invalid = results.filter((r) => !r.crash && r.schemaViolation).map((r) => `${r.file} — ${r.schemaViolation}`);
		expect(invalid).toEqual([]);
	});

	it('no compounding / unbounded divergence (the dangerous kind)', () => {
		// hard gate: the round-trip must not keep changing the file unboundedly. a bounded
		// one-space oscillation in a raw-preserved block is tolerated (reported separately);
		// real divergence or growth is not.
		const bad = results.filter((r) => !r.crash && r.convergedAt === 0 && !r.oscillating).map((r) => `${r.file} — ${r.firstDiff}`);
		expect(bad).toEqual([]);
	});

	it('round-trip settles to a fixed point on the first save for the large majority', () => {
		const settledP1 = results.filter((r) => !r.crash && r.convergedAt === 1).length;
		const total = results.filter((r) => !r.crash).length;
		// regression guard: most real-world files should be byte-stable immediately
		expect(settledP1 / total).toBeGreaterThanOrEqual(0.5);
	});

	it('prose words are preserved (ratio >= 0.95)', () => {
		const lossy = results.filter((r) => !r.crash && r.wordRatio < 0.95).map((r) => `${r.file}:${r.wordRatio.toFixed(3)}`);
		expect(lossy).toEqual([]);
	});

	// a content diff on an untouched save is always a real bug (a span-capture gap or a
	// substitution-assembly mistake). hard gate, no threshold: this is the entire promise
	// of the verbatim layer.
	it('no CONTENT diff on an untouched save (verbatim preservation must never alter meaning)', () => {
		const bad = results
			.filter((r) => !r.crash && r.diffKind === 'content')
			.map((r) => `${r.file} (coverage ${(r.origCoverage * 100).toFixed(0)}%) — ${r.firstByteDiff}`);
		expect(bad).toEqual([]);
	});

	// whitespace-only drift is tolerated but tracked: regressions show up as a falling
	// byte-identical rate without a red test. the threshold is a coarse regression guard, not a
	// correctness gate (that's the content-diff test above, a hard zero). comment/raw-heavy
	// corpora legitimately land lower (observed ~52%-85% across three real-arXiv corpora), so
	// 0.4 sits under the low end; it exists to catch wholesale breakage, not to chase a number.
	it('a large majority of untouched files save byte-identical', () => {
		const live = results.filter((r) => !r.crash);
		const identical = live.filter((r) => r.byteIdentical).length;
		expect(live.length === 0 ? 1 : identical / live.length).toBeGreaterThanOrEqual(0.4);
	});
});
