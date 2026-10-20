// Feeds compile-log problems into CodeMirror's lint state, narrowing each line-level
// diagnostic to the offending token and skipping dispatches that cannot change anything.
import type { EditorView } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { forEachDiagnostic, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { addPackageInsertion } from '$lib/languages/latex/intellisense/packages/packageInsertion';
import { isLatexCheckId } from '$lib/languages/latex/intellisense/checks/checkSwitches';
import { checkName } from '$lib/languages/latex/intellisense/checks/checkTexts';
import { m } from '$lib/paraglide/messages';
import { diagnosticHeading, fixOffer, type SourceDiagnosticHandlers } from './diagnostics/diagnosticFixes';
import { mountDiagnosticCard } from './diagnostics/mountDiagnosticCard';
import type { SourceDiagnostic } from './sourceEditorTypes';

export type { SourceDiagnosticHandlers };

// narrows a line-level diagnostic to the offending token: the anchor text (the log's l.NN
// context tail, or a \ref/\cite key) re-locates the error point even when the buffer drifted
// since the compile; the raw column is the fallback, the whole line the last resort.
export function diagnosticRange(doc: EditorState['doc'], d: SourceDiagnostic): { from: number; to: number } {
	const startLine = doc.line(Math.min(d.line, doc.lines));
	const endLine = doc.line(Math.min(d.lineEnd ?? d.line, doc.lines));
	if (d.lineEnd === undefined) {
		if (d.anchorText) {
			// a live check says where its anchor starts, for a name that stands twice on the line
			const exact = d.rule !== undefined && d.column !== undefined && startLine.text.startsWith(d.anchorText, d.column - 1);
			const at = exact ? d.column! - 1 : startLine.text.indexOf(d.anchorText);
			if (at !== -1) {
				// a \ref/\cite key anchors ON itself
				if (d.token === undefined && !d.anchorText.includes('\\')) {
					return { from: startLine.from + at, to: startLine.from + at + d.anchorText.length };
				}
				// an l.NN tail ENDS at the error point: the offending token is its last chars
				const errPoint = at + d.anchorText.length;
				const len = Math.max(1, d.token?.length ?? 1);
				const from = startLine.from + Math.max(at, errPoint - len);
				return { from, to: Math.min(startLine.to, startLine.from + errPoint) };
			}
		}
		if (d.column !== undefined && d.column - 1 <= startLine.length) {
			const from = startLine.from + Math.max(0, d.column - 1 - Math.max(0, d.token?.length ?? 0));
			return { from, to: Math.min(startLine.to, from + Math.max(1, d.token?.length ?? 1)) };
		}
	}
	return { from: startLine.from, to: Math.max(endLine.to, startLine.from) };
}

function rangeOf(view: EditorView, diagnostic: Diagnostic): { from: number; to: number } {
	let range = { from: diagnostic.from, to: diagnostic.to };
	forEachDiagnostic(view.state, (d, from, to) => {
		if (d === diagnostic) range = { from, to };
	});
	return range;
}

function cardOf(view: EditorView, diagnostic: Diagnostic, d: SourceDiagnostic, handlers: SourceDiagnosticHandlers): HTMLElement {
	const offer = fixOffer(d, handlers, () => addPackageInsertion(view.state.doc.toString(), '') !== null);
	const rule = d.rule;
	const range = rangeOf(view, diagnostic);
	return mountDiagnosticCard(
		{
			severity: d.severity,
			heading: diagnosticHeading(d),
			message: d.message,
			fix: offer
				? {
						kind: offer.kind,
						label: offer.label,
						code: offer.code,
						replacing: offer.kind === 'replace' ? view.state.sliceDoc(range.from, range.to) : undefined,
						apply: () => offer.apply(view, rangeOf(view, diagnostic))
					}
				: undefined,
			turnOff:
				rule === undefined
					? undefined
					: {
							tip: m.lint_turn_off_tip({ check: isLatexCheckId(rule) ? checkName(rule) : rule }),
							apply: () => handlers.turnOffRule(rule)
						}
		},
		view.dom.ownerDocument.body
	);
}

export class SourceDiagnosticsFeed {
	// dispatching setDiagnostics re-runs every StateField, so skip when nothing can change:
	// empty mapped onto empty, or the same list on an unchanged doc (re-anchoring only matters
	// once either of them moved)
	private lastDoc: EditorState['doc'] | null = null;
	private lastList: SourceDiagnostic[] | null = null;
	// a recount that finds the same problems would close an open card
	private lastKey = '';
	private lastEmpty = true;

	constructor(private handlers: SourceDiagnosticHandlers) {}

	apply(view: EditorView, list: SourceDiagnostic[]): void {
		const doc = view.state.doc;
		const valid = list.filter((d) => Number.isInteger(d.line) && d.line >= 1);
		if (valid.length === 0 && this.lastEmpty) return;
		if (list === this.lastList && doc === this.lastDoc) return;
		const key = JSON.stringify(valid);
		if (key === this.lastKey && doc === this.lastDoc) return;
		const mapped: Diagnostic[] = valid.map((d) => {
			const diagnostic: Diagnostic = {
				...diagnosticRange(doc, d),
				severity: d.severity,
				message: d.message,
				renderMessage: (view) => cardOf(view, diagnostic, d, this.handlers)
			};
			return diagnostic;
		});
		view.dispatch(setDiagnostics(view.state, mapped));
		this.lastDoc = doc;
		this.lastList = list;
		this.lastKey = key;
		this.lastEmpty = mapped.length === 0;
	}
}
