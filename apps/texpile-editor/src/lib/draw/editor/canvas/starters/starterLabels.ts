import { m } from '$lib/paraglide/messages';
import type { NewPictureKind } from '../../figure/figureLanguage';

const STARTER_NAMES: Record<string, () => string> = {
	tikzpicture: () => m.figure_starter_tikzpicture(),
	flowchart: () => m.figure_starter_flowchart(),
	plot: () => m.figure_starter_plot(),
	automaton: () => m.figure_starter_automaton(),
	tikzcd: () => m.figure_starter_tikzcd(),
	forest: () => m.figure_starter_forest(),
	'free-body': () => m.figure_starter_free_body(),
	circuit: () => m.figure_starter_circuit()
};

export function starterName(kind: NewPictureKind) {
	return STARTER_NAMES[kind.id]?.() ?? kind.name;
}
