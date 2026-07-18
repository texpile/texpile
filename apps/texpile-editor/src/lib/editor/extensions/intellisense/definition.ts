// go-to-definition: F12 (and Ctrl/Cmd-click) jumps from a \ref{…}/\label, a user-macro
// invocation, a \cite key, a \gls key, or an \input target to where it's defined — in this
// buffer when possible, else in the project file projectIntel located it in.
import { keymap, EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { get } from 'svelte/store';
import { flashLineEffect } from '$lib/editor/extensions/synctex-flash/synctexFlash';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { tokenAt, findLabelOffset } from './hover';

const INCLUDE_TRIGGER = /\\(?:input|include|subfile|subfileinclude)\{([^{}]+)\}/g;

const DEF_PATTERNS = (escaped: string) => [
	`\\\\(?:new|renew|provide)command\\*?\\s*\\{?\\\\${escaped}\\}?`,
	`\\\\(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand\\s*\\{?\\\\${escaped}\\}?`,
	`\\\\DeclareMathOperator\\*?\\{\\\\${escaped}\\}`,
	`\\\\DeclarePairedDelimiter(?:XPP|X)?\\{?\\\\${escaped}\\}?`,
	`\\\\(?:(?:re)?newrobustcmd|DeclareRobustCommand)\\*?\\s*\\{\\\\${escaped}\\}`
];

export function findMacroDefinition(text: string, name: string): number | null {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const idx = text.search(new RegExp(DEF_PATTERNS(escaped).join('|')));
	return idx < 0 ? null : idx;
}

export function includeTargetAt(lineText: string, lineStart: number, pos: number): string | null {
	for (const m of lineText.matchAll(INCLUDE_TRIGGER)) {
		const groupStart = lineStart + (m.index ?? 0) + m[0].indexOf(m[1]);
		const groupEnd = groupStart + m[1].length;
		if (pos >= groupStart && pos <= groupEnd) return m[1];
	}
	return null;
}

function jumpTo(view: EditorView, offset: number): void {
	view.dispatch({ selection: { anchor: offset }, scrollIntoView: true, effects: flashLineEffect.of(offset) });
	view.focus();
}

export interface DefinitionHooks {
	/** open an \input/\include target by its written name (resolution is the workspace's job) */
	onJumpToFile?: (name: string) => void;
	/** open another project file at a 1-based line (cross-file definitions) */
	onOpenFileAt?: (file: string, line: number) => void;
}

function definitionAt(view: EditorView, pos: number, hooks: DefinitionHooks): boolean {
	const line = view.state.doc.lineAt(pos);
	const text = view.state.doc.toString();

	const includeTarget = includeTargetAt(line.text, line.from, pos);
	if (includeTarget) {
		hooks.onJumpToFile?.(includeTarget);
		return true;
	}

	const token = tokenAt(line.text, line.from, pos);
	if (!token) return false;
	const intel = get(projectIntelStore);
	const openAt = (file: string, targetLine: number): boolean => {
		hooks.onOpenFileAt?.(file, targetLine);
		return !!hooks.onOpenFileAt;
	};

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
		const escaped = token.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const idx = text.search(
			new RegExp(`\\\\(?:(?:long)?(?:new|provide)glossaryentry|new(?:acronym|abbreviation|abbr))(?:\\[[^\\]]*\\])?\\{${escaped}\\}`)
		);
		if (idx >= 0) {
			jumpTo(view, idx);
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
