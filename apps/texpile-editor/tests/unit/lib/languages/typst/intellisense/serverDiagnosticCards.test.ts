import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { setDiagnostics } from '@codemirror/lint';
import { sameProblems, type Problem } from '$lib/languages/typst/intellisense/serverDiagnosticCards';

const unknown: Problem = { from: 12, to: 20, severity: 'error', message: 'unknown variable: thicknes' };

function stateWith(problems: Problem[]): EditorState {
	const state = EditorState.create({ doc: 'The film is #thicknes nm thick.' });
	return state.update(setDiagnostics(state, problems)).state;
}

describe('sameProblems', () => {
	it('holds for the list tinymist publishes a second time', () => {
		expect(sameProblems(stateWith([unknown]), [{ ...unknown }])).toBe(true);
		expect(sameProblems(EditorState.create({ doc: '' }), [])).toBe(true);
	});

	it('fails once a problem moved, changed or went away', () => {
		const state = stateWith([unknown]);
		expect(sameProblems(state, [{ ...unknown, from: 13 }])).toBe(false);
		expect(sameProblems(state, [{ ...unknown, message: 'unknown variable: thickne' }])).toBe(false);
		expect(sameProblems(state, [])).toBe(false);
	});
});
