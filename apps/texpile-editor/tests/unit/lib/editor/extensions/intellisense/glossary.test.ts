import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { documentPackages } from '../../../../../../src/lib/languages/latex/intellisense/packages/loadedPackages';
import { glossaryCompletionSource, knownGlossary } from '../../../../../../src/lib/languages/latex/intellisense/completion/glossary';

const GLOSSARIES = '\\documentclass{article}\n\\usepackage[shortcuts]{glossaries}\n';

function completeAt(doc: string, pos = doc.length) {
	const state = EditorState.create({ doc: GLOSSARIES + doc });
	return glossaryCompletionSource(new CompletionContext(state, GLOSSARIES.length + pos, false));
}
const labels = async (r: ReturnType<typeof completeAt>) => ((await r)?.options ?? []).map((o) => o.label);

describe('glossary/acronym completion', () => {
	it('completes \\gls{...} from \\newglossaryentry', async () => {
		const doc = '\\newglossaryentry{gpu}{description={Graphics Processing Unit}}\n\\gls{gp';
		expect(await labels(completeAt(doc))).toContain('gpu');
	});

	it('completes \\acs{...} from \\newacronym', async () => {
		const doc = '\\newacronym{cpu}{CPU}{Central Processing Unit}\n\\acs{cp';
		expect(await labels(completeAt(doc))).toContain('cpu');
	});

	it("completes acro's \\ac{...} from \\DeclareAcronym, described by its long form", async () => {
		const doc = '\\usepackage{acro}\n\\DeclareAcronym{cpu}{short=CPU, long=central processing unit}\n\\ac{c';
		const state = EditorState.create({ doc: '\\documentclass{article}\n' + doc });
		const r = await glossaryCompletionSource(new CompletionContext(state, state.doc.length, false));
		expect(r?.options.find((o) => o.label === 'cpu')?.detail).toBe('central processing unit');
	});

	it('acronym commands only offer acronym entries, not plain glossary entries', async () => {
		const doc =
			'\\newglossaryentry{gpu}{description={Graphics Processing Unit}}\n' + '\\newacronym{cpu}{CPU}{Central Processing Unit}\n\\acs{';
		const labelsFound = await labels(completeAt(doc));
		expect(labelsFound).toContain('cpu');
		expect(labelsFound).not.toContain('gpu');
	});

	it('\\gls{...} (not acronym-specific) offers both pools', async () => {
		const doc =
			'\\newglossaryentry{gpu}{description={Graphics Processing Unit}}\n' + '\\newacronym{cpu}{CPU}{Central Processing Unit}\n\\gls{';
		const labelsFound = await labels(completeAt(doc));
		expect(labelsFound).toContain('cpu');
		expect(labelsFound).toContain('gpu');
	});

	it('completes \\gls{...} from \\longprovideglossaryentry', async () => {
		const doc = '\\longprovideglossaryentry{ml}{name=ML}{machine learning}\n\\gls{m';
		expect(await labels(completeAt(doc))).toContain('ml');
	});

	it('returns nothing when there are no glossary/acronym definitions', async () => {
		expect(await completeAt('\\gls{foo')).toBeNull();
	});

	it('reads \\gls from the common index when the document loads no glossary package', async () => {
		const state = EditorState.create({ doc: '\\documentclass{article}\n\\newacronym{cpu}{CPU}{Central Processing Unit}\n\\gls{' });
		const result = await glossaryCompletionSource(new CompletionContext(state, state.doc.length, false));
		expect(result?.options.map((o) => o.label)).toContain('cpu');
	});

	it('knows an entry defined in the open file, which the hover reads', async () => {
		const text = GLOSSARIES + '\\newglossaryentry{gpu}{name=GPU,description={Graphics Processing Unit}}\n\\gls{gpu}';
		const entry = (await knownGlossary(text, await documentPackages(text))).get('gpu');
		expect(entry?.description).toBe('Graphics Processing Unit');
	});
});
