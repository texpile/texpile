import type { EditorState } from '@codemirror/state';
import { spansLines, type FoldKind, type KindedFold } from '$lib/editor/source/extensions/fold-kinds/foldKinds';
import { commonEnvFacts, holdsMath } from '../knowledge/environments/envFacts';
import { floatTypes } from '../knowledge/registries/floatTypes';
import { displayMathFoldOf, environmentFoldOf, foldTree } from './fold';

function kindOf(name: string): FoldKind {
	const facts = commonEnvFacts(name);
	if (facts.body === 'math-display') return 'equation';
	if (facts.float || floatTypes().has(name.replace(/\*$/, '')) || (facts.cells && !holdsMath(facts))) return 'float';
	return 'environment';
}

/** every environment and display formula that folds across lines, by kind */
export function latexFoldKinds(state: EditorState): KindedFold[] {
	const out: KindedFold[] = [];
	foldTree(state).iterate({
		enter(ref) {
			if (ref.name === 'BeginEnv') {
				const fold = environmentFoldOf(state, ref.node);
				if (fold && spansLines(state, fold.range)) out.push({ ...fold.range, kind: kindOf(fold.name) });
			} else if (ref.name === 'BracketMath' || ref.name === 'DisplayMath') {
				const range = displayMathFoldOf(state, ref.node);
				if (range) out.push({ ...range, kind: 'equation' });
			}
		}
	});
	return out;
}
