// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, showTooltip } from '@codemirror/view';
import { argumentHintAt, argumentHints } from '../../../../../../../src/lib/languages/latex/intellisense/signature/argumentHints';
import type { ArgumentHint } from '../../../../../../../src/lib/languages/latex/intellisense/signature/argumentSlots';
import { renderArgumentHint } from '../../../../../../../src/lib/languages/latex/intellisense/signature/argumentHintDom';
import { documentPackages } from '../../../../../../../src/lib/languages/latex/intellisense/packages/loadedPackages';
import { openRenameCard, renameCard } from '../../../../../../../src/lib/editor/source/rename/renameCardTooltip';
import { updateSettings } from '../../../../../../../src/lib/settings';

const PREAMBLE = '\\usepackage{graphicx}\n';

// the cursor is at the |
async function stateAt(marked: string): Promise<EditorState> {
	const doc = marked.replaceAll('|', '');
	await documentPackages(doc);
	return EditorState.create({ doc, selection: { anchor: marked.indexOf('|') }, extensions: argumentHints() });
}

function shown(state: EditorState): string | null {
	const tip = state.facet(showTooltip).find((t) => t);
	return tip ? tip.create({} as EditorView).dom.textContent : null;
}

afterEach(() => updateSettings({ argumentHints: true }));

describe('argument hints', () => {
	it('opens as an argument is typed or asked for, never when the cursor lands in one', async () => {
		const doc = '\\textbf{a} \\emph';
		await documentPackages(doc);
		const view = new EditorView({ state: EditorState.create({ doc, extensions: argumentHints() }), parent: document.body });
		view.dispatch({ selection: { anchor: 9 } });
		expect(shown(view.state)).toBeNull();
		view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, shiftKey: true, bubbles: true }));
		expect(shown(view.state)).toBe('\\textbf{text}');
		view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(shown(view.state)).toBeNull();
		view.dispatch({ changes: { from: 9, insert: 'x' }, selection: { anchor: 10 }, userEvent: 'input.type' });
		expect(shown(view.state)).toBeNull();
		const end = view.state.doc.length;
		view.dispatch({ changes: { from: end, insert: '{}' }, selection: { anchor: end + 1 }, userEvent: 'input.type' });
		expect(shown(view.state)).toBe('\\emph{text}');
		view.dispatch({ changes: { from: end + 1, insert: 'y' }, selection: { anchor: end + 2 }, userEvent: 'input.type' });
		expect(shown(view.state)).toBe('\\emph{text}');
		view.destroy();
	});

	it('once open follows the keyboard into another call and closes on a click, as VS Code does', async () => {
		const doc = '\\textbf{a \\emph{b}}';
		await documentPackages(doc);
		const view = new EditorView({ state: EditorState.create({ doc, extensions: argumentHints() }), parent: document.body });
		updateSettings({ argumentHints: false });
		view.dispatch({ selection: { anchor: 9 } });
		view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, shiftKey: true, bubbles: true }));
		expect(shown(view.state)).toBe('\\textbf{text}');
		view.dispatch({ selection: { anchor: 16 }, userEvent: 'select' });
		expect(shown(view.state)).toBe('\\emph{text}');
		view.dispatch({ selection: { anchor: 9 }, userEvent: 'select.pointer' });
		expect(shown(view.state)).toBeNull();
		view.destroy();
	});

	it('shows the form with the argument under the cursor emphasised', async () => {
		const state = await stateAt(`${PREAMBLE}\\includegraphics[|]{x}`);
		const hint = argumentHintAt(state)!;
		expect(hint.slots.map((s) => s.open + s.label + s.close).join('')).toBe('[options]{file}');
		expect(hint.active).toBe(0);
		const dom = renderArgumentHint(hint);
		expect(dom.textContent).toBe('\\includegraphics[options]{file}');
		expect(dom.querySelector('.cm-argument-hint-active')?.textContent).toBe('[options]');
	});

	it('follows the cursor to the next argument and into a nested group', async () => {
		expect(argumentHintAt(await stateAt(`${PREAMBLE}\\includegraphics[width=1]{|x}`))!.active).toBe(1);
		expect(argumentHintAt(await stateAt('\\textbf{a \\emph{b} |c}'))!.command).toBe('textbf');
	});

	it('shows nothing after the closing brace', async () => {
		expect(argumentHintAt(await stateAt(`${PREAMBLE}\\includegraphics[a]{x}| more`))).toBeNull();
	});

	it('shows the slots of a user macro with a known parameter count', async () => {
		const hint = argumentHintAt(await stateAt('\\newcommand{\\pair}[2]{(#1,#2)}\n\\pair{a}{|b}'))!;
		expect(hint.slots.map((s) => s.open + s.close).join('')).toBe('{}{}');
		expect(hint.active).toBe(1);
	});

	it('takes a macro the document defines over the common one', async () => {
		const hint = argumentHintAt(await stateAt('\\newcommand{\\abs}[2]{#1}\n\\abs{|'))!;
		expect(hint.slots.map((s) => s.open + s.close).join('')).toBe('{}{}');
		expect(hint.active).toBe(0);
	});

	it('shows the arguments of an environment', async () => {
		const form = (hint: ArgumentHint | null) =>
			hint && `\\${hint.command}${hint.slots.map((s) => s.open + s.label + s.close).join('')}@${hint.active}`;
		const article = '\\documentclass{article}\n\\usepackage{tabularx}\n\\begin{document}\n';
		expect(form(argumentHintAt(await stateAt(`${article}\\begin{tabular}{|`)))).toBe('\\begin{tabular}[]{}@1');
		expect(form(argumentHintAt(await stateAt(`${article}\\begin{figure}[|`)))).toBe('\\begin{figure}[placement]@0');
		expect(form(argumentHintAt(await stateAt(`${article}\\begin{itemize}[|`)))).toBe('\\begin{itemize}[]@0');
		expect(form(argumentHintAt(await stateAt(`${article}\\begin{tabularx}{\\textwidth}{|`)))).toBe('\\begin{tabularx}{}[]{}@2');
		const own = '\\newenvironment{box}[2]{}{}\n';
		expect(form(argumentHintAt(await stateAt(`${own}\\begin{box}{a}{|`)))).toBe('\\begin{box}{}{}@1');
		expect(argumentHintAt(await stateAt(`${article}\\begin{tabular}{cc}\na & |`))).toBeNull();
	});

	it('waits for a space before the bare name of a file command', async () => {
		expect(argumentHintAt(await stateAt('\\include|'))).toBeNull();
		expect(argumentHintAt(await stateAt('\\usepackage|'))).toBeNull();
		expect(argumentHintAt(await stateAt('\\include |'))?.command).toBe('include');
	});

	it('stays out of verbatim and listing bodies', async () => {
		expect(argumentHintAt(await stateAt(`${PREAMBLE}\\begin{lstlisting}\n\\includegraphics[|`))).toBeNull();
		expect(argumentHintAt(await stateAt(`${PREAMBLE}\\begin{verbatim}\n\\includegraphics[|`))).toBeNull();
		expect(argumentHintAt(await stateAt(`${PREAMBLE}\\begin{verbatim}\nx\n\\end{verbatim}\n\\includegraphics[|`))).not.toBeNull();
	});

	it('reads a percent sign after a line break as a comment', async () => {
		expect(argumentHintAt(await stateAt(`${PREAMBLE}a \\\\% \\includegraphics[|`))).toBeNull();
		expect(argumentHintAt(await stateAt(`${PREAMBLE}a \\% \\includegraphics[|`))).not.toBeNull();
	});

	it('shows the starred form of a starred command', async () => {
		expect(argumentHintAt(await stateAt('\\section*{|'))?.command).toBe('section*');
		expect(argumentHintAt(await stateAt('\\section{|'))?.command).toBe('section');
	});

	it('shows the parameters of a \\def macro', async () => {
		const hint = argumentHintAt(await stateAt('\\def\\pair#1#2{(#1,#2)}\n\\pair{a}{|'))!;
		expect(hint.slots.map((s) => s.open + s.close).join('')).toBe('{}{}');
		expect(hint.active).toBe(1);
	});

	it('mounts as a tooltip and goes away with the setting off', async () => {
		const on = await stateAt(`${PREAMBLE}\\includegraphics|{x}`);
		const head = on.selection.main.head;
		const first = on.update({ changes: { from: head, insert: '[]' }, selection: { anchor: head + 1 }, userEvent: 'input.type' }).state;
		expect(shown(first)).toBe('\\includegraphics[options]{file}');
		updateSettings({ argumentHints: false });
		expect(shown(first.update({ selection: { anchor: first.selection.main.head - 1 } }).state)).toBeNull();
	});

	it('reads a command from the class once the document packages load', async () => {
		const doc = '\\documentclass[a5paper]{article}\n\\begin{document}\n\\section';
		const view = new EditorView({ doc, selection: { anchor: doc.length }, extensions: argumentHints(), parent: document.body });
		view.dispatch({ changes: { from: doc.length, insert: '{}' }, selection: { anchor: doc.length + 1 }, userEvent: 'input.type' });
		expect(shown(view.state)).toBeNull();
		await vi.waitFor(() => expect(shown(view.state)).toBe('\\section[short title]{title}'));
		view.destroy();
	});

	it('hides the hint while the rename card is open', async () => {
		const marked = '\\documentclass[a5paper]{article}\n\\begin{document}\n\\section{a}\\label{|x}';
		const doc = marked.replaceAll('|', '');
		await documentPackages(doc);
		const view = new EditorView({
			doc,
			selection: { anchor: marked.indexOf('|') },
			extensions: [argumentHints(), renameCard],
			parent: document.body
		});
		view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, shiftKey: true, bubbles: true }));
		const hints = () => view.state.facet(showTooltip).filter((t) => t && t.above);
		expect(hints()).toHaveLength(1);
		openRenameCard(view, { from: marked.indexOf('|'), title: 'Rename', name: 'x', problemOf: () => null, onRename: () => {} });
		expect(hints()).toHaveLength(0);
		view.destroy();
	});
});
