import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { spansLines, type KindedFold } from '$lib/editor/source/extensions/fold-kinds/foldKinds';
import { displayEquationFold, insideDelimiters } from './typstFold';

const FLOAT_CALLS = new Set(['figure', 'table']);

/** the calls, blocks and display equations that fold across lines, by kind */
export function typstFoldKinds(state: EditorState): KindedFold[] {
	const out: KindedFold[] = [];
	syntaxTree(state).iterate({
		enter(ref) {
			if (ref.name === 'Equation') {
				const range = displayEquationFold(ref.node, state);
				if (range) out.push({ ...range, kind: 'equation' });
			} else if (ref.name === 'Args' || ref.name === 'CodeBlock' || ref.name === 'ContentBlock') {
				const range = insideDelimiters(ref.node);
				if (!range || !spansLines(state, range)) return;
				const callee = ref.name === 'Args' ? ref.node.prevSibling : null;
				const float = callee && FLOAT_CALLS.has(state.sliceDoc(callee.from, callee.to));
				out.push({ ...range, kind: float ? 'float' : 'environment' });
			}
		}
	});
	return out;
}
