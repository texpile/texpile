// go-to-definition: F12 (and Ctrl/Cmd-click) jumps from a \ref{…}/\label, a user-macro
// invocation, a \cite key, a \gls key, or an \input target to where it's defined — in this
// buffer when possible, else in the project file projectIntel located it in.
import { keymap, EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { flashLineEffect } from '$lib/languages/latex/source/synctexFlash';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { dirOf, fileCallsIn, namesTried } from '../knowledge/calls/fileCommands';
import { rolesOf } from '../knowledge/calls/commandCalls';
import { codeOnly } from '../texCode';
import { definedIn, primitiveDefsIn } from '../userDefinitions';
import { tokenAt, findLabelOffset } from './hover';
import { documentPackagesNow } from './packages/loadedPackages';
import { scanGlossary } from './completion/glossary';

export function findMacroDefinition(text: string, name: string): number | null {
	const code = codeOnly(text);
	const at = [...definedIn(code, 'macro'), ...primitiveDefsIn(code)].filter((d) => d.name === name).map((d) => d.at);
	return at.length ? Math.min(...at) : null;
}

/** the files an \input-style call under `pos` may name, in the order TeX tries them */
export function includeTargetAt(lineText: string, lineStart: number, pos: number): string[] | null {
	for (const call of fileCallsIn(lineText, ['file'])) {
		for (const file of call.args) {
			if (!file.arg.loads || !rolesOf(file.arg).includes('file')) continue;
			for (const { value, at } of file.values) {
				if (pos < lineStart + at || pos > lineStart + at + value.length) continue;
				const dir = dirOf(call, file);
				return namesTried(file.arg, value).map((n) => (dir ? `${dir.replace(/\/+$/, '')}/${n}` : n));
			}
		}
	}
	return null;
}

function jumpTo(view: EditorView, offset: number): void {
	view.dispatch({ selection: { anchor: offset }, scrollIntoView: true, effects: flashLineEffect.of(offset) });
	view.focus();
}

export type DefinitionHooks = {
	/** open an \input/\include target from the names TeX tries (the folders to look in are the workspace's job) */
	onJumpToFile?: (names: string[]) => void;
	/** open another project file at a 1-based line (cross-file definitions) */
	onOpenFileAt?: (file: string, line: number) => void;
};

function definitionAt(view: EditorView, pos: number, hooks: DefinitionHooks): boolean {
	const line = view.state.doc.lineAt(pos);
	const text = view.state.doc.toString();

	const includeTarget = includeTargetAt(line.text, line.from, pos);
	if (includeTarget) {
		hooks.onJumpToFile?.(includeTarget);
		return true;
	}

	const loaded = documentPackagesNow(text);
	const token = tokenAt(line.text, line.from, pos, loaded);
	if (!token) return false;
	const intel = projectIntelStore.current;
	function openAt(file: string, targetLine: number): boolean {
		hooks.onOpenFileAt?.(file, targetLine);
		return !!hooks.onOpenFileAt;
	}

	if (token.kind === 'label') {
		const offset = findLabelOffset(text, token.value);
		if (offset != null) {
			jumpTo(view, offset);
			return true;
		}
		const remote = intel.labels.find((l) => l.name === token.value);
		if (remote) return openAt(remote.file, remote.line);
	}
	if (token.kind === 'macro') {
		const offset = findMacroDefinition(text, token.value);
		if (offset != null) {
			jumpTo(view, offset);
			return true;
		}
		const remote = intel.macros.find((m) => m.name === token.value);
		if (remote) return openAt(remote.file, remote.line);
	}
	if (token.kind === 'citekey') {
		const remote = intel.bibEntries.find((e) => e.key === token.value);
		if (remote) return openAt(remote.file, remote.line);
	}
	if (token.kind === 'glosskey') {
		const here = loaded && scanGlossary(text, loaded).find((g) => g.key === token.value);
		if (here) {
			jumpTo(view, view.state.doc.line(here.line).from);
			return true;
		}
		const remote = intel.glossary.find((g) => g.key === token.value);
		if (remote) return openAt(remote.file, remote.line);
	}
	return false;
}

/** F12 / Ctrl-click go-to-definition for labels, macros, cite keys, glossary keys and includes. */
export function goToDefinition(hooks: DefinitionHooks = {}): Extension {
	return [
		keymap.of([
			{
				key: 'F12',
				run: (view) => definitionAt(view, view.state.selection.main.head, hooks)
			}
		]),
		EditorView.domEventHandlers({
			mousedown(event, view) {
				if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
				const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
				if (pos == null) return false;
				return definitionAt(view, pos, hooks);
			}
		})
	];
}
