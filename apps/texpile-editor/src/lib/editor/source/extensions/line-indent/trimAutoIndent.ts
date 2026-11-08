// VS Code's trimAutoWhitespace: the indent Enter adds goes again when the caret leaves the line untyped
import { EditorState, StateField, type ChangeSpec, type Extension, type Transaction } from '@codemirror/state';

type AutoIndentLine = { from: number; indent: string };

function untouchedLine(tr: Transaction, line: AutoIndentLine): { from: number; to: number } | null {
	const from = tr.changes.mapPos(line.from, -1);
	const now = tr.newDoc.lineAt(from);
	return now.from === from && now.text === line.indent ? now : null;
}

function newAutoIndentLines(tr: Transaction): AutoIndentLine[] {
	const added: AutoIndentLine[] = [];
	for (const range of tr.newSelection.ranges) {
		if (!range.empty) continue;
		const line = tr.newDoc.lineAt(range.head);
		if (range.head !== line.to || !/^[ \t]+$/.test(line.text)) continue;
		let broken = false;
		tr.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
			if (fromB < line.from && line.from <= toB && inserted.toString().includes('\n')) broken = true;
		});
		if (broken) added.push({ from: line.from, indent: line.text });
	}
	return added;
}

const autoIndentLines = StateField.define<AutoIndentLine[]>({
	create: () => [],
	update(lines, tr) {
		if (!tr.docChanged) return lines;
		const kept = lines.flatMap((line) => {
			const now = untouchedLine(tr, line);
			return now ? [{ from: now.from, indent: line.indent }] : [];
		});
		return tr.isUserEvent('input') ? [...kept, ...newAutoIndentLines(tr)] : kept;
	}
});

const trimLeftLines = EditorState.transactionFilter.of((tr) => {
	const lines = tr.startState.field(autoIndentLines, false);
	if (!lines?.length || (!tr.docChanged && !tr.selection)) return tr;
	const changes: ChangeSpec[] = [];
	for (const line of lines) {
		const now = untouchedLine(tr, line);
		if (!now) continue;
		const caretOnLine = tr.newSelection.ranges.some((r) => r.head >= now.from && r.head <= now.to);
		if (!caretOnLine) changes.push({ from: now.from, to: now.to });
	}
	return changes.length ? [tr, { changes, sequential: true }] : tr;
});

export function trimAutoIndent(): Extension {
	return [autoIndentLines, trimLeftLines];
}
