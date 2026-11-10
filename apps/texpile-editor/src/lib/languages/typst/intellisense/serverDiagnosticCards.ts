// tinymist's problems as lint diagnostics, each drawing the card a LaTeX problem draws
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { forEachDiagnostic, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { LSPPlugin, type LSPClientExtension } from '@codemirror/lsp-client';
import { mountDiagnosticCard } from '$lib/editor/source/diagnostics/mountDiagnosticCard';
import { m } from '$lib/paraglide/messages';
import type { TypstDiagnostic } from './lspClient';

export type Problem = Pick<Diagnostic, 'from' | 'to' | 'severity' | 'message'>;
type Published = { uri: string; version?: number | null; diagnostics: TypstDiagnostic[] };

const SEVERITIES: Diagnostic['severity'][] = ['error', 'warning', 'info', 'hint'];

function keyOf(p: Problem): string {
	return `${p.from}:${p.to}:${p.severity}:${p.message}`;
}

/** tinymist publishes its list again after a hover request, and a new lint state would close the card that hover opened */
export function sameProblems(state: EditorState, next: Problem[]): boolean {
	const shown: string[] = [];
	forEachDiagnostic(state, (d, from, to) => shown.push(keyOf({ from, to, severity: d.severity, message: d.message })));
	return shown.length === next.length && shown.sort().join('\n') === next.map(keyOf).sort().join('\n');
}

function cardOf(view: EditorView, p: Problem): HTMLElement {
	return mountDiagnosticCard(
		{
			severity: p.severity === 'hint' ? 'info' : p.severity,
			heading: p.severity === 'error' ? m.lint_compile_error() : m.lint_compile_warning(),
			message: p.message
		},
		view.dom.ownerDocument.body
	);
}

export function typstDiagnosticCards(): LSPClientExtension {
	return {
		clientCapabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
		notificationHandlers: {
			'textDocument/publishDiagnostics': (client, params: Published) => {
				const file = client.workspace.getFile(params.uri);
				if (!file || (params.version != null && params.version !== file.version)) return false;
				const view = file.getView();
				const plugin = view && LSPPlugin.get(view);
				if (!view || !plugin) return false;
				function offset(pos: { line: number; character: number }): number {
					return plugin!.unsyncedChanges.mapPos(plugin!.fromPosition(pos, plugin!.syncedDoc));
				}
				const problems: Problem[] = params.diagnostics.map((d) => ({
					from: offset(d.range.start),
					to: offset(d.range.end ?? d.range.start),
					severity: SEVERITIES[(d.severity ?? 1) - 1] ?? 'hint',
					message: d.message
				}));
				if (sameProblems(view.state, problems)) return true;
				view.dispatch(
					setDiagnostics(
						view.state,
						problems.map((p) => ({ ...p, renderMessage: (v) => cardOf(v, p) }))
					)
				);
				return true;
			}
		}
	};
}
