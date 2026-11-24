// \cref, \autoref, \pageref, \nameref and \hyperref drawn the way a \ref is: tinted text the editor's count or the
// compiler's .aux fills in. It follows the store, so a compile finishing updates it in place
import {
	countedLabelsOf,
	DEFAULT_CROSS_REF_NAMES,
	onDrawnInputs,
	projectIntelStore,
	setRefLook,
	templateFeaturesStore,
	undefinedRefs,
	type ChipFace,
	type LabelNumbers
} from '$lib/languages/latex/visual/core';
import { faceElement } from '$lib/editor/canvas';
import { crossRefText, withCounted } from './crossRefText';

export function crossRefFace(command: string, labels: string[], shown: string | null, source: string, range = false): ChipFace {
	const dom = faceElement('span', 'drawn-crossref');
	let counted: LabelNumbers | null = null;
	// drawn now, so the line breaker measures it, and again whenever a compile writes a new .aux
	function show(): void {
		const intel = projectIntelStore.current;
		const written = { numbers: intel.auxNumbers, pages: intel.auxPages, kinds: intel.auxKinds, titles: intel.auxTitles };
		const aux = withCounted(written, labels, counted);
		const names = templateFeaturesStore.current.crossRefNames ?? DEFAULT_CROSS_REF_NAMES;
		// no label yet prints what LaTeX prints for one it cannot resolve
		const unlabeled = labels.length === 0;
		const text = (shown ?? (unlabeled ? '' : crossRefText(command, labels, aux, names, range).text)) || '??';
		// the numbers are handed over again on every key typed anywhere, and the same text written again reads as a
		// change of size to the line breaker, which then breaks the chip's paragraph anew
		if (dom.textContent !== text) dom.textContent = text;
		const missing = labels.find((label) => undefinedRefs.current.has(label) && !counted?.has(label));
		setRefLook(dom, unlabeled || missing !== undefined);
		dom.hint = missing !== undefined ? `Label "${missing}" not found` : source;
	}
	show();
	const stop = onDrawnInputs(show);
	return {
		dom,
		decorate(decorations) {
			counted = countedLabelsOf(decorations);
			show();
		},
		destroy: stop
	};
}
