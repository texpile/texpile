// JS-rendered "(1)" line numbers for per-line environments (align, gather); single-label
// environments and plain equations use CSS ::after fed by data-equation-number.
import type { EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { isSingleLabelEnvironment, numberedLineCount } from './mathEnvironments';

/** equation numbers are sequential across the whole doc, count everything numbered before this node. */
function equationStartNumber(view: EditorView, myPos: number): number {
	let count = 1;

	view.state.doc.descendants((n, pos) => {
		if (pos >= myPos) return false;

		if (n.type.name === 'block_math' && n.attrs.numbered) {
			const nodeEnv = n.attrs.environment || '';
			const isSingleLabel = isSingleLabelEnvironment(nodeEnv);
			// multline prints one number for the whole block; everything else numbers per row, and
			// counting labels here skipped every row nobody had labelled
			count += isSingleLabel ? 1 : numberedLineCount(n.textContent || '');
		}
	});

	return count;
}

/* eslint-disable no-param-reassign -- rendering writes the handed container */
export function renderEquationNumbers(view: EditorView, node: Node, dom: HTMLElement, container: HTMLElement, myPos: number): void {
	const isNumbered = node.attrs.numbered;
	const environment = node.attrs.environment;
	const lineLabels = (node.attrs.lineLabels as string[]) || [];

	container.innerHTML = '';

	const startingNumber = equationStartNumber(view, myPos);

	// CSS ::after reads this for single-line equations
	dom.setAttribute('data-equation-number', String(startingNumber));

	const isSingleLabelEnv = isSingleLabelEnvironment(environment || '');

	if (!isNumbered || !environment || isSingleLabelEnv) {
		container.style.display = 'none';
		return;
	}

	const effectiveLineCount = numberedLineCount(node.textContent || '');

	container.style.display = 'flex';

	for (let i = 0; i < effectiveLineCount; i++) {
		const numEl = document.createElement('span');
		numEl.className = 'equation-number-line';
		numEl.textContent = `(${startingNumber + i})`;
		numEl.setAttribute('data-line-label', lineLabels[i] || '');
		container.appendChild(numEl);
	}
}
