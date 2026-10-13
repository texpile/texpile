// a math search pick put into the source editor as text: MathLive's places to type into (#@ for the
// selection, #0 and #? for empty slots) become plain text, and the caret lands in the first empty one
import type { EditorView as CMView } from '@codemirror/view';

export type SourceMathText = { text: string; caret: number };

export function sourceMathText(template: string, selected: string, after: string): SourceMathText {
	let text = '';
	let caret = -1;
	for (const part of template.split(/(#[@0?])/)) {
		if (!/^#[@0?]$/.test(part)) {
			text += part;
			continue;
		}
		const fill = part === '#@' ? selected : '';
		if (caret < 0 && !fill) caret = text.length;
		text += fill;
	}
	// \alpha typed against a letter would read as one longer command
	if (/\\[a-zA-Z]+$/.test(text) && /^[a-zA-Z]/.test(after)) text += ' ';
	return { text, caret: caret < 0 ? text.length : caret };
}

export function insertIntoSource(view: CMView, template: string): void {
	const { from, to } = view.state.selection.main;
	const { text, caret } = sourceMathText(template, view.state.sliceDoc(from, to), view.state.sliceDoc(to, to + 1));
	view.dispatch({
		changes: { from, to, insert: text },
		selection: { anchor: from + caret },
		scrollIntoView: true,
		userEvent: 'input.complete'
	});
	view.focus();
}
