// the label, citation key or glossary entry the cursor is on, a definition included
import type { EditorState } from '@codemirror/state';
import { docText } from '$lib/editor/source/docText';
import type { UseKind } from '$lib/workspace/edits/renameUses';
import { callsIn, rolesOf, type CommandReadings } from '../../knowledge/calls/commandCalls';
import { loadedReadings } from '../../knowledge/calls/loadedReadings';
import type { Role } from '../../knowledge/types';
import { tokenAt } from '../hover';
import { documentPackagesNow } from '../packages/loadedPackages';

export type RenameTarget = { kind: UseKind; name: string; from: number; to: number };

const KIND_OF_TOKEN = { label: 'label', citekey: 'cite', glosskey: 'glossary' } as const;

// hover leaves these definitions out, since a key defined on its own line has nothing to preview
function definitionAt(
	lineText: string,
	lineStart: number,
	pos: number,
	role: Role,
	kind: UseKind,
	own?: CommandReadings
): RenameTarget | null {
	for (const call of callsIn(lineText, [role], own)) {
		for (const arg of call.args) {
			if (!arg.arg.defines || !rolesOf(arg.arg).includes(role)) continue;
			for (const { value, at } of arg.values) {
				const from = lineStart + at;
				if (pos >= from && pos <= from + value.length) return { kind, name: value, from, to: from + value.length };
			}
		}
	}
	return null;
}

export function renameTargetAt(state: EditorState, pos: number): RenameTarget | null {
	const line = state.doc.lineAt(pos);
	const loaded = documentPackagesNow(docText(state.doc));
	const token = tokenAt(line.text, line.from, pos, loaded);
	const kind = token && token.kind in KIND_OF_TOKEN ? KIND_OF_TOKEN[token.kind as keyof typeof KIND_OF_TOKEN] : null;
	// \nocite{*} names every entry
	if (token && kind && token.value !== '*') return { kind, name: token.value, from: token.from, to: token.to };
	return (
		definitionAt(line.text, line.from, pos, 'citekey', 'cite') ??
		(loaded ? definitionAt(line.text, line.from, pos, 'glossary', 'glossary', loadedReadings(loaded, ['glossary'])) : null)
	);
}
