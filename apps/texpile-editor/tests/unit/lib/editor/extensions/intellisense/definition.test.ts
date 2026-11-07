// @vitest-environment jsdom
// definition.ts reaches mathlive, whose browser build touches HTMLElement as it loads
import { describe, it, expect } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { findMacroDefinition, goToDefinition, includeTargetAt } from '../../../../../../src/lib/languages/latex/intellisense/definition';
import { documentPackages } from '../../../../../../src/lib/languages/latex/intellisense/packages/loadedPackages';

describe('go-to-definition helpers', () => {
	it('finds a \\newcommand definition by name', () => {
		const text = 'intro\n\\newcommand{\\foo}{bar text}\nmore \\foo here';
		expect(findMacroDefinition(text, 'foo')).toBe(text.indexOf('\\newcommand'));
	});

	it('finds a \\NewDocumentCommand definition too', () => {
		const text = '\\NewDocumentCommand{\\bar}{m}{#1}';
		expect(findMacroDefinition(text, 'bar')).toBe(0);
	});

	it('does not match a longer macro name and ignores a commented definition', () => {
		expect(findMacroDefinition('\\newcommand{\\foobar}{x}', 'foo')).toBeNull();
		const text = '% \\newcommand{\\foo}{x}\n\\def\\foo{y}';
		expect(findMacroDefinition(text, 'foo')).toBe(text.indexOf('\\def'));
	});

	it('returns null for a macro with no definition in the buffer', () => {
		expect(findMacroDefinition('\\textbf{x}', 'textbf')).toBeNull();
	});

	it('finds an \\input{...} target under the cursor', () => {
		const line = '\\input{chapters/intro}';
		const target = includeTargetAt(line, line.indexOf('intro') + 2);
		expect(target).toEqual(['chapters/intro.tex', 'chapters/intro']);
	});

	it('finds a target whose argument starts on the line above', () => {
		const text = '\\include{%\n  chapters/intro}';
		expect(includeTargetAt(text, text.indexOf('intro'))).toEqual(['chapters/intro.tex']);
	});

	it('puts the folder of \\import in front of the file name and reads an unbraced \\input', () => {
		const line = '\\import{parts/}{intro} \\input chap1';
		expect(includeTargetAt(line, line.indexOf('intro'))).toEqual(['parts/intro.tex', 'parts/intro']);
		expect(includeTargetAt(line, line.indexOf('parts'))).toBeNull();
		expect(includeTargetAt(line, line.indexOf('chap1') + 1)).toEqual(['chap1.tex', 'chap1']);
	});

	it('tries only the name with .tex for \\include, which always appends it', () => {
		const line = '\\include{part.one}';
		expect(includeTargetAt(line, line.indexOf('part') + 1)).toEqual(['part.one.tex']);
	});

	it('returns null when the cursor is outside any include macro', () => {
		expect(includeTargetAt('plain text here', 5)).toBeNull();
	});
});

describe('F12 go to definition in the open file', () => {
	// the cursor is at the |; returns the caret after F12, or null when F12 did nothing
	async function pressF12(marked: string): Promise<number | null> {
		const doc = marked.replaceAll('|', '');
		await documentPackages(doc);
		const view = new EditorView({
			state: EditorState.create({ doc, selection: { anchor: marked.indexOf('|') }, extensions: goToDefinition() }),
			parent: document.body
		});
		let handled = false;
		view.contentDOM.addEventListener('keydown', (e) => (handled ||= e.defaultPrevented));
		view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'F12', bubbles: true, cancelable: true }));
		const head = view.state.selection.main.head;
		view.destroy();
		return handled ? head : null;
	}

	it('jumps to the label, the glossary or acronym entry and stays put on text with no target', async () => {
		const label = '\\section{A}\\label{sec:a}\n\\ref{sec:|a}';
		expect(await pressF12(label)).toBe(label.indexOf('\\label'));
		expect(await pressF12('\\label{sec:|a}')).toBe(0);
		const theorem = '\\begin{theorem}\\label{thm:m} A.\\end{theorem}\n\\ref{thm:|m}';
		expect(await pressF12(theorem)).toBe(theorem.indexOf('\\label'));
		expect(await pressF12('\\ref{no|label}')).toBeNull();
		expect(await pressF12('plain |text')).toBeNull();
		const gloss = '\\newglossaryentry{latex}{name=latex,description=d}\n\\gls{la|tex}';
		expect(await pressF12(gloss)).toBe(0);
		const acro = '\\usepackage{acro}\n\\DeclareAcronym{cpu}{short=CPU,long=central}\n\\ac{c|pu}';
		expect(await pressF12(acro)).toBe(acro.indexOf('\n\\DeclareAcronym') + 1);
	});
});
