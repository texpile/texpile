// an inline chip's source stays on its lines: a change that adds a line is dropped, one that keeps or joins lines applies
import { EditorState } from '@codemirror/state';

export const singleLineGuard = EditorState.transactionFilter.of((tr) => (tr.newDoc.lines > tr.startState.doc.lines ? [] : tr));
