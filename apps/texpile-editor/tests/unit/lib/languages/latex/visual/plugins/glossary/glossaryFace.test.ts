// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { scanGlossary } from '$lib/languages/latex/intellisense/completion/glossary';
import { templateFeaturesStore } from '$lib/stores/editorStore';

const text = (source: string) => latexFace(source, false)?.dom.textContent ?? null;

afterEach(() => {
	templateFeaturesStore.current = { ...templateFeaturesStore.current, glossary: undefined };
});

describe('glossary references', () => {
	it('reads the short and long form from each package’s definer', () => {
		const entries = scanGlossary(
			String.raw`\newacronym{gnu}{GNU}{GNU's Not Unix}
\acro{AI}{Artificial Intelligence}
\acro{ML}[ML]{Machine Learning}
\newglossaryentry{latex}{name={\LaTeX}, description={a typesetting system}}`,
			[]
		);
		expect(entries.map((e) => [e.key, e.short, e.long])).toEqual([
			['gnu', 'GNU', "GNU's Not Unix"],
			['AI', 'AI', 'Artificial Intelligence'],
			['ML', 'ML', 'Machine Learning'],
			['latex', '\\LaTeX', '']
		]);
	});

	it('draws \\acs, \\acf and the plural and capital forms from the entry the document defines', () => {
		templateFeaturesStore.current = {
			...templateFeaturesStore.current,
			glossary: scanGlossary(String.raw`\acro{CNN}{convolutional neural network}`, [])
		};
		expect(text(String.raw`\acs{CNN}`)).toBe('CNN');
		expect(text(String.raw`\acf{CNN}`)).toBe('convolutional neural network (CNN)');
		expect(text(String.raw`\acsp{CNN}`)).toBe('CNNs');
		expect(text(String.raw`\acl{CNN}`)).toBe('convolutional neural network');
		expect(text(String.raw`\Acrlong{CNN}`)).toBe('Convolutional neural network');
	});

	it('shows the key of an entry nothing defines', () => {
		const face = latexFace(String.raw`\acs{XYZ}`, false);
		expect(face?.dom.textContent).toBe('XYZ');
		expect(face?.dom.classList.contains('drawn-glossary-missing')).toBe(true);
	});
});
