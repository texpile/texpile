import type { FigureLanguage } from '$lib/draw/editor/figure/figureLanguage';
import { addBranch, moveBranch, shiftBranch } from './source/forest/forestEdits';

type TreeMethods = Pick<FigureLanguage, 'addBranch' | 'moveBranch' | 'shiftBranch'>;

export const tikzTrees: TreeMethods = {
	addBranch: (source, st, where, text) => (st.kind === 'branch' ? addBranch(source, st.from, where, text) : null),
	moveBranch: (source, st, onto) => (st.kind === 'branch' && onto.kind === 'branch' ? moveBranch(source, st.from, onto.from) : null),
	shiftBranch: (source, st, by) => (st.kind === 'branch' ? shiftBranch(source, st.from, by) : null)
};
