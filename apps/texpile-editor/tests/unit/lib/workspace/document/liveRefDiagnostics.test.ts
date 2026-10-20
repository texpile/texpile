// a LaTeX check turned off produces no diagnostic, and one that is on carries its rule and the exact range
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { diagnosticRange } from '$lib/editor/source/sourceDiagnosticsFeed';
import { withLiveRefs } from '$lib/workspace/document/liveRefDiagnostics';
import type { LiveRefProblems } from '$lib/workspace/document/liveRefChecks.svelte';
import { setLatexCheck } from '$lib/languages/latex/intellisense/checks/checkSwitches';
import { updateSettings } from '$lib/settings';

const text = '\\documentclass{article}\n\\usepackage{foo} \\foo \\foo\n';
const second = text.lastIndexOf('\\foo');
const live = (): LiveRefProblems => ({
	path: '/p/main.tex',
	text,
	problems: [],
	checks: [{ rule: 'undefined-command', at: second, anchor: '\\foo', message: 'Undefined' }]
});

afterEach(() => updateSettings({ latexChecks: {} }));

describe('withLiveRefs checks', () => {
	it('anchors on the occurrence the check found', () => {
		const [d] = withLiveRefs([], live(), '/p/main.tex');
		expect(d).toMatchObject({ line: 2, rule: 'undefined-command', severity: 'warning', anchorText: '\\foo' });
		const doc = EditorState.create({ doc: text }).doc;
		expect(diagnosticRange(doc, d)).toEqual({ from: second, to: second + 4 });
	});

	it('leaves a command to the compile when it reported the same one on that line', () => {
		const compiled = { line: 2, severity: 'error' as const, message: 'Undefined control sequence.', token: '\\foo' };
		expect(withLiveRefs([compiled], live(), '/p/main.tex')).toEqual([compiled]);
	});

	it('leaves an undefined environment to the compile when it reported it on that line', () => {
		const env = '\\begin{align}\nx\n\\end{align}\n';
		const found: LiveRefProblems = {
			path: '/p/main.tex',
			text: env,
			problems: [],
			checks: [{ rule: 'undefined-command', at: 7, anchor: 'align', message: 'Undefined' }]
		};
		const compiled = {
			line: 1,
			severity: 'error' as const,
			message: 'LaTeX Error: Environment align undefined.',
			anchorText: '\\begin{align}'
		};
		expect(withLiveRefs([compiled], found, '/p/main.tex')).toEqual([compiled]);
		expect(withLiveRefs([], found, '/p/main.tex')).toHaveLength(1);
	});

	it('gives nothing once the check is off', () => {
		const same = live();
		expect(withLiveRefs([], same, '/p/main.tex')).toHaveLength(1);
		setLatexCheck('undefined-command', false);
		expect(withLiveRefs([], same, '/p/main.tex')).toHaveLength(0);
	});
});
