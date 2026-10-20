// @vitest-environment jsdom
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { forEachDiagnostic, type Diagnostic } from '@codemirror/lint';
import { SourceDiagnosticsFeed } from '$lib/editor/source/sourceDiagnosticsFeed';
import type { SourceDiagnostic } from '$lib/editor/source/sourceEditorTypes';

function shownCard(doc: string, d: Partial<SourceDiagnostic>, addPackageTo: ((path: string, name: string) => Promise<void>) | null = null) {
	const view = new EditorView({ doc });
	const feed = new SourceDiagnosticsFeed({ turnOffRule: () => {}, addPackageTo: () => addPackageTo });
	feed.apply(view, [{ line: 1, severity: 'warning', message: 'Undefined', ...d }]);
	const found: Diagnostic[] = [];
	forEachDiagnostic(view.state, (diagnostic) => found.push(diagnostic));
	const [diagnostic] = found;
	return { view, diagnostic, card: diagnostic.renderMessage!(view) as HTMLElement };
}

const buttons = (card: HTMLElement) =>
	[...card.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent!.trim());

describe('SourceDiagnosticsFeed cards', () => {
	const fix = { kind: 'add-package', name: 'booktabs', into: '/w/main.tex' } as const;

	it('draws a diagnostic as a card, with none of the stock actions or source label', () => {
		const { diagnostic, card } = shownCard('\\toprule', { rule: 'undefined-command', message: 'x comes from booktabs.', fix });
		expect(diagnostic.actions).toBeUndefined();
		expect(diagnostic.source).toBeUndefined();
		expect(card.textContent).toContain('Undefined commands');
		expect(card.textContent).toContain('x comes from booktabs.');
	});

	it('adds to the main file for a file that holds none of the preamble', () => {
		const { card } = shownCard('\\toprule', { rule: 'undefined-command', fix }, async () => {});
		expect(buttons(card)).toEqual(['More actions', 'Add \\usepackage{booktabs} to main.tex']);
	});

	it('leaves out the fix for such a file when nothing can write the main file', () => {
		expect(buttons(shownCard('\\toprule', { rule: 'undefined-command', fix }).card)).toEqual(['More actions']);
	});

	it('adds to the open file when it holds \\begin{document}', () => {
		const { card } = shownCard('\\begin{document}\\toprule', { rule: 'undefined-command', fix });
		expect(buttons(card)).toEqual(['More actions', 'Add \\usepackage{booktabs}']);
	});

	it('keeps Turn off in the more actions menu', async () => {
		const { card } = shownCard('\\toprule', { rule: 'undefined-command' });
		card.querySelector<HTMLButtonElement>('[aria-label="More actions"]')!.click();
		await tick();
		expect(buttons(card)).toEqual(['More actions', 'Turn off']);
	});

	it('heads a compile log entry by its kind and offers no switch', () => {
		const { card } = shownCard('x', { severity: 'error', message: 'Undefined control sequence.' });
		expect(card.textContent).toContain('Compile error');
		expect(buttons(card)).toEqual([]);
	});

	it('replaces the option text in one step', () => {
		const { view, card } = shownCard('\\documentclass[11ptt]{article}', {
			rule: 'unknown-option',
			column: 17,
			anchorText: '11ptt',
			message: 'Did you mean 11pt?',
			fix: { kind: 'replace-text', text: '11pt' }
		});
		card.querySelector<HTMLButtonElement>('button:not([aria-label])')!.click();
		expect(view.state.doc.toString()).toBe('\\documentclass[11pt]{article}');
	});

	it('dispatches nothing when a recount finds the same problems, so an open card stays', () => {
		const view = new EditorView({ doc: '\\toprule' });
		const feed = new SourceDiagnosticsFeed({ turnOffRule: () => {}, addPackageTo: () => null });
		const problem = (): SourceDiagnostic => ({ line: 1, severity: 'warning', message: 'Undefined', rule: 'undefined-command' });
		feed.apply(view, [problem()]);
		const before = view.state;
		feed.apply(view, [problem()]);
		expect(view.state).toBe(before);
	});
});
