// the problem card under the word on hover: the lint package's own hover opens above it, with no option for below
import { hoverTooltip, type EditorView as CMView } from '@codemirror/view';
import { forEachDiagnostic, setDiagnosticsEffect, type Diagnostic } from '@codemirror/lint';

/** a diagnostic that draws its own card, which the compile log's and tinymist's all do */
function hasCard(d: Diagnostic): boolean {
	return !!d.renderMessage;
}

function cardsAt(view: CMView, pos: number, side: -1 | 1) {
	let range: { from: number; to: number } | null = null;
	const found: Diagnostic[] = [];
	forEachDiagnostic(view.state, (d, from, to) => {
		const over = pos >= from && pos <= to && (from === to || ((pos > from || side > 0) && (pos < to || side < 0)));
		if (!over || !hasCard(d) || (range && (range.from !== from || range.to !== to))) return;
		range = { from, to };
		found.push(d);
	});
	return range ? { range: range as { from: number; to: number }, found } : null;
}

export function diagnosticHover() {
	return hoverTooltip(
		(view, pos, side) => {
			const at = cardsAt(view, pos, side);
			if (!at) return null;
			return {
				pos: at.range.from,
				end: at.range.to,
				above: false,
				create() {
					const dom = document.createElement('div');
					dom.className = 'cm-diagnostic-cards';
					for (const d of at.found) dom.append(d.renderMessage!(view));
					return { dom };
				}
			};
		},
		{
			hideOn(tr, tooltip) {
				const line = tr.startState.doc.lineAt(tooltip.pos);
				return tr.effects.some((e) => e.is(setDiagnosticsEffect)) || !!tr.changes.touchesRange(line.from, line.to);
			}
		}
	);
}
