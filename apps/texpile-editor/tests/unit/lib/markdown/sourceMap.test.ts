// The markdown side of the block source map — what places a collaborator's caret inside a block.
//
// The property that actually matters is NOT that stripMarkdown produces pretty text: it is that
// the words surviving the strip match the rendered text's words in order and COUNT. The caret is
// placed by counting occurrences of the last word, so a word that survives but is never rendered
// (a link target, a reference definition) shifts every later caret onto the wrong repeat.
import { describe, expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { parseMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { stripMarkdown } from '$lib/languages/markdown/visual/sourceMap';
import { bodyOffsetOf } from '$lib/workspace/latexRoundtrip';
import { buildBlockMap, pmPosToSourceOffset, sourceOffsetToPmPos } from '$lib/editor/visual/sourceMap';

const words = (s: string) => s.match(/[\p{L}\p{N}_]{3,}/gu) ?? [];

describe('stripMarkdown', () => {
	it('drops markers that render as nothing', () => {
		expect(words(stripMarkdown('## Heading text'))).toEqual(['Heading', 'text']);
		expect(words(stripMarkdown('> quoted line'))).toEqual(['quoted', 'line']);
		expect(words(stripMarkdown('- [ ] pending task'))).toEqual(['pending', 'task']);
		expect(words(stripMarkdown('3. ordered entry'))).toEqual(['ordered', 'entry']);
	});

	it('keeps a link/image caption but never its target', () => {
		expect(words(stripMarkdown('see [the docs](https://example.com/manual)'))).toEqual(['see', 'the', 'docs']);
		expect(words(stripMarkdown('![a kitten](figures/kitten.png)'))).toEqual(['kitten']);
		expect(words(stripMarkdown('[label][someref] tail'))).toEqual(['label', 'tail']);
		expect(words(stripMarkdown('[someref]: https://example.com/target'))).toEqual([]);
	});

	it('keeps snake_case as ONE word, which is where reusing stripLatex broke', () => {
		expect(words(stripMarkdown('the snake_case_word stays'))).toEqual(['the', 'snake_case_word', 'stays']);
		// but a real emphasis pair still goes
		expect(stripMarkdown('_emphasised_ text').trim()).toBe('emphasised text');
		expect(stripMarkdown('**bold** and *italic*').trim()).toBe('bold and italic');
		expect(stripMarkdown('~~struck~~ out').trim()).toBe('struck out');
	});

	it('drops html tags and math delimiters, keeping the visible text', () => {
		expect(words(stripMarkdown('press <kbd class="key">Ctrl</kbd> now'))).toEqual(['press', 'Ctrl', 'now']);
		expect(words(stripMarkdown('before $x^2$ after'))).toEqual(['before', 'after']);
	});

	it('keeps fenced code CONTENT (the editor renders it) but not the fence', () => {
		const out = stripMarkdown('```python\nreturn payload\n```');
		expect(words(out)).toEqual(['return', 'payload']);
	});

	it('preserves occurrence counts against the rendered text', () => {
		// "target" appears once as prose; the url must not contribute a second
		const src = 'the target word and [target](https://target.example/target) again';
		expect(stripMarkdown(src).match(/target/g)?.length).toBe(2); // prose + link caption only
	});
});

// ---- end to end over a real parsed markdown document ----

/** the doc's visible text with a PM position per char, mirroring the sourceMap's own indexing */
function visibleIndex(doc: PMNode): { text: string; positions: number[] } {
	let text = '';
	const positions: number[] = [];
	let sawBlock = false;
	doc.nodesBetween(0, doc.content.size, (node, pos) => {
		if (node.isText && node.text) {
			for (let k = 0; k < node.text.length; k++) {
				positions.push(pos + k);
				text += node.text[k];
			}
		} else if (node.isLeaf && node.isInline) {
			positions.push(pos);
			text += '￼';
		} else if (node.isTextblock) {
			if (sawBlock) {
				positions.push(pos);
				text += '\n';
			}
			sawBlock = true;
		}
		return true;
	});
	return { text, positions };
}

const DOC = `---
title: Sample
---

# Introduction

Plain prose with unique tokens: quartz, fjord and crocodile each appear once here.

A paragraph with *emphasis*, a snake_case_token and [a link](https://example.com/somewhere) inside.

- bullet mentioning zebra
- bullet mentioning walrus

> quoted passage about tungsten

| Column | Meaning |
| :--- | ---: |
| alpha | describes beryllium |

\`\`\`python
def compute_payload():
    return 42
\`\`\`
`;

describe('markdown block map round-trips positions', () => {
	const parsed = parseMarkdownFile(DOC);
	const doc = parsed.doc;
	const map = buildBlockMap(doc, bodyOffsetOf(parsed));
	const vis = visibleIndex(doc);

	// every word that occurs exactly once in both source and rendered text is unambiguous truth
	const probes = [...DOC.matchAll(/[A-Za-z_]{5,}/g)].filter(
		(m) =>
			DOC.indexOf(m[0]) === DOC.lastIndexOf(m[0]) && vis.text.indexOf(m[0]) >= 0 && vis.text.indexOf(m[0]) === vis.text.lastIndexOf(m[0])
	);

	it('has enough unambiguous probes to be meaningful', () => {
		expect(probes.length).toBeGreaterThanOrEqual(8);
	});

	it('maps source offsets back into the correct block', () => {
		for (const m of probes) {
			const srcEnd = m.index + m[0].length;
			const pm = sourceOffsetToPmPos(doc, map, srcEnd, stripMarkdown);
			expect(pm, `"${m[0]}" mapped nowhere`).not.toBeNull();
			// the position must land inside the block that owns this source offset
			const owner = [...map].reverse().find((b) => b.srcStart != null && b.srcStart <= srcEnd);
			expect(owner, `"${m[0]}" has no owning block`).toBeTruthy();
			expect(pm!, `"${m[0]}" left its block`).toBeGreaterThanOrEqual(owner!.pmPos);
			expect(pm!, `"${m[0]}" left its block`).toBeLessThanOrEqual(owner!.pmEnd);
		}
	});

	it('lands most probes within a couple of characters of the true position', () => {
		let close = 0;
		for (const m of probes) {
			const vi = vis.text.indexOf(m[0]);
			const truth = vi + m[0].length < vis.positions.length ? vis.positions[vi + m[0].length] : vis.positions[vis.positions.length - 1] + 1;
			const pm = sourceOffsetToPmPos(doc, map, m.index + m[0].length, stripMarkdown);
			if (pm != null && Math.abs(pm - truth) <= 2) close++;
		}
		// a floor, not a target: unanchored offsets fall back to proportional interpolation
		expect(close / probes.length).toBeGreaterThanOrEqual(0.7);
	});

	it('the forward direction agrees, so a published caret survives a round trip', () => {
		let close = 0;
		for (const m of probes) {
			const vi = vis.text.indexOf(m[0]);
			const pmPos = vi + m[0].length < vis.positions.length ? vis.positions[vi + m[0].length] : vis.positions[vis.positions.length - 1] + 1;
			const fwd = pmPosToSourceOffset(doc, map, pmPos);
			if (fwd != null && Math.abs(fwd - (m.index + m[0].length)) <= 2) close++;
		}
		expect(close / probes.length).toBeGreaterThanOrEqual(0.7);
	});
});

// The stripper only changes the answer where a word REPEATS — a word occurring once is found by
// name whatever survives around it. This is that case, and it is the whole reason markdown can't
// borrow stripLatex: stripLatex leaves `(...)` intact, so the url's copy of the word counts as a
// real occurrence and the caret is placed after the wrong one.
describe('a link target must not be counted as a rendered word', () => {
	const SRC = 'See [payload](https://example.com/payload) and then payload again.\n';
	const parsed = parseMarkdownFile(SRC);
	const doc = parsed.doc;
	const map = buildBlockMap(doc, bodyOffsetOf(parsed));
	const vis = visibleIndex(doc);

	// the offset just past the SECOND prose occurrence ("and then payload|")
	const offset = SRC.indexOf('payload', SRC.indexOf('and then')) + 'payload'.length;
	// ground truth: the same point in the rendered text "See payload and then payload again."
	const vi = vis.text.indexOf('payload', vis.text.indexOf('and then'));
	const truth = vis.positions[vi + 'payload'.length];

	it('the fixture really does repeat the word across prose and url', () => {
		expect(vis.text.match(/payload/g)).toHaveLength(2); // rendered: caption + prose
		expect(SRC.match(/payload/g)).toHaveLength(3); // source: caption + url + prose
	});

	it('stripMarkdown places the caret exactly', () => {
		expect(sourceOffsetToPmPos(doc, map, offset, stripMarkdown)).toBe(truth);
	});

	it("sourceMap's LaTeX default does not, which is what markdown used to get", () => {
		expect(sourceOffsetToPmPos(doc, map, offset, undefined)).not.toBe(truth);
	});
});
