// The chip never invents a number, checked against real papers rather than against documents
// written to make it pass. These are where counting broke: kerr labels propositions and lemmas,
// gpt3 labels rows inside tables the editor keeps raw, and the count gave every one of them a
// confident wrong number.
//
// Most of those papers are excluded from the repository, so this suite SKIPS where they are not
// checked out. refState.test.ts covers the same rules everywhere; this is the wider net.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { latexToProseMirror } from '../../../../src/lib/languages/latex/parser/converter';
import { refState } from '$lib/languages/latex/visual/extensions/ref/refState';
import { parseAuxLabels } from '$lib/workspace/auxLabels';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../live/fixtures');
const NO_REFS: ReadonlySet<string> = new Set();

type Chip = { label: string; command: string };

// parsing the corpus is the expensive part - kerr alone takes seconds - so each paper is read
// once and every case sharing it reuses the result
const parsed = new Map<string, Chip[]>();

/** every \ref the parser turned into a chip, with the command it carries */
function chips(paper: { name: string; src: string }): Chip[] {
	const cached = parsed.get(paper.name);
	if (cached) return cached;
	const out: Chip[] = [];
	latexToProseMirror(paper.src, {}).doc.descendants((node) => {
		if (node.type.name === 'ref') out.push({ label: node.textContent, command: String(node.attrs.command ?? 'ref') });
	});
	parsed.set(paper.name, out);
	return out;
}

/** the papers checked out here that carry cross-references */
function papers(): { name: string; src: string }[] {
	if (!fs.existsSync(fixtures)) return [];
	return fs
		.readdirSync(fixtures)
		.map((name) => ({ name, file: path.join(fixtures, name, 'main.tex') }))
		.filter((f) => fs.existsSync(f.file))
		.map((f) => ({ name: f.name, src: fs.readFileSync(f.file, 'utf8') }))
		.filter((p) => /\\(?:eq)?ref\{/.test(p.src));
}

const corpus = papers();

describe.skipIf(corpus.length === 0)('the reference chip against real papers', () => {
	for (const paper of corpus) {
		// one case per paper, so a regression names the document it broke on
		it(`shows labels, not guesses, before ${paper.name} has compiled`, () => {
			const guessed = chips(paper)
				.map((c) => ({ label: c.label, text: refState(c.command, c.label, {}, NO_REFS).text }))
				.filter((r) => r.text !== r.label);
			expect({ paper: paper.name, guessed }).toEqual({ paper: paper.name, guessed: [] });
		}, 60_000);

		it(`prints the compiler's own numbers for ${paper.name}`, () => {
			const found = chips(paper);
			// the .aux this paper would produce: every label it references, numbered by the engine
			const aux = Object.fromEntries([...new Set(found.map((c) => c.label))].map((l, i) => [l, `${i + 1}`]));
			const wrong = found
				.map((c) => ({
					label: c.label,
					want: c.command === 'eqref' ? `(${aux[c.label]})` : aux[c.label],
					got: refState(c.command, c.label, aux, NO_REFS).text
				}))
				.filter((r) => r.got !== r.want);
			expect({ paper: paper.name, wrong }).toEqual({ paper: paper.name, wrong: [] });
		}, 60_000);
	}

	// the labels a real engine wrote, read by the code that reads them in the app. What can break
	// here is the two sides disagreeing about a label's spelling - kerr has labels with spaces and
	// full stops in them - which would leave a reference unresolved for no visible reason.
	const compiled = corpus
		.map((p) => ({ paper: p, aux: path.join(fixtures, p.name, '_draft/draft.aux') }))
		.filter((c) => fs.existsSync(c.aux));

	for (const { paper, aux } of compiled) {
		it(`resolves ${paper.name} against the .aux its own compile wrote`, () => {
			const numbers = parseAuxLabels(fs.readFileSync(aux, 'utf8')).numbers;
			const found = chips(paper);
			const unresolved = found.filter((c) => refState(c.command, c.label, numbers, NO_REFS).text === c.label);
			expect({ paper: paper.name, refs: found.length, unresolved: unresolved.map((c) => c.label) }).toEqual({
				paper: paper.name,
				refs: found.length,
				unresolved: []
			});
		}, 60_000);
	}
});
