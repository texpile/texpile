import type { EditorView as CMView } from '@codemirror/view';
import { addPackageInsertion } from '$lib/languages/latex/intellisense/packages/packageInsertion';
import { movePackageAbove } from '$lib/languages/latex/intellisense/packages/packageMove';
import { isLatexCheckId } from '$lib/languages/latex/intellisense/checks/checkSwitches';
import { checkName } from '$lib/languages/latex/intellisense/checks/checkTexts';
import { m } from '$lib/paraglide/messages';
import { basename } from '$lib/workspace/fileSystem';
import type { SourceDiagnostic } from '../sourceEditorTypes';

export type SourceDiagnosticHandlers = {
	/** the "Turn off" button was pressed on a diagnostic of this rule */
	turnOffRule: (rule: string) => void;
	/** the workspace's way to add a package to another file of the document; null when it cannot write there */
	addPackageTo: () => ((path: string, name: string) => Promise<void>) | null;
};

export type FixOffer = {
	kind: 'add' | 'move' | 'replace';
	label: string;
	code?: string;
	apply: (view: CMView, range: { from: number; to: number }) => void;
};

/** the one-click repair a diagnostic carries, when this editor can make it */
export function fixOffer(d: SourceDiagnostic, handlers: SourceDiagnosticHandlers, holdsDocument: () => boolean): FixOffer | null {
	const fix = d.fix;
	if (fix?.kind === 'add-package') {
		const command = `\\usepackage{${fix.name}}`;
		if (holdsDocument()) {
			return {
				kind: 'add',
				label: m.lint_add_package({ command }),
				code: command,
				apply(view) {
					const at = addPackageInsertion(view.state.doc.toString(), fix.name);
					if (at) view.dispatch({ changes: { from: at.at, insert: at.insert } });
				}
			};
		}
		const elsewhere = handlers.addPackageTo();
		if (fix.into && elsewhere) {
			const into = fix.into;
			return {
				kind: 'add',
				label: m.lint_add_package_to_file({ command, file: basename(into) }),
				code: command,
				apply: () => void elsewhere(into, fix.name)
			};
		}
	}
	if (fix?.kind === 'move-package') {
		const command = `\\usepackage{${fix.first}}`;
		return {
			kind: 'move',
			label: m.lint_move_package({ command, earlier: fix.second.replace(/^class-/, '') }),
			code: command,
			apply(view) {
				const changes = movePackageAbove(view.state.doc.toString(), fix.first, fix.second);
				if (changes) view.dispatch({ changes });
			}
		};
	}
	if (fix?.kind === 'replace-text') {
		return { kind: 'replace', label: fix.text, apply: (view, { from, to }) => view.dispatch({ changes: { from, to, insert: fix.text } }) };
	}
	return null;
}

/** the card's header: the check's name, else the log's kind of entry */
export function diagnosticHeading(d: SourceDiagnostic): string {
	if (d.rule !== undefined && isLatexCheckId(d.rule)) return checkName(d.rule);
	if (d.heading) return d.heading;
	return d.severity === 'error' ? m.lint_compile_error() : m.lint_compile_warning();
}
