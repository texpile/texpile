import { commonCommand } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { encodingSelectedBy, encodingTable } from '$lib/languages/latex/knowledge/commands/fontEncodings';
import type { EncodingTable } from '$lib/languages/latex/knowledge/types';
import { mandatoryArgs, type TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import { hasArgs, isBlank, type Drawing } from '../reading/drawing';
import { unitsOf } from '../reading/chipUnits';
import { ownMacroArguments, ownMacroBody, ownMacroDefinition } from '../own/ownMacroFace.svelte';

function namedBy(call: TreeCall, src: string): EncodingTable | null {
	const body = mandatoryArgs(call)[0]?.body;
	return body ? encodingTable(src.slice(body.from, body.to).trim()) : null;
}

export function switchedEncoding(call: TreeCall, d: Drawing): EncodingTable | null {
	if (call.name === 'fontencoding') return namedBy(call, d.src);
	if (!ownMacroDefinition(call.name))
		return !hasArgs(call) && commonCommand(call.name)?.args.length === 0 ? encodingSelectedBy(call.name) : null;
	if (hasArgs(call) || ownMacroArguments(call.name)) return null;
	const body = ownMacroBody(call.name, d.src.slice(call.from, call.to));
	const first = body === null ? undefined : unitsOf(body).find((unit) => !isBlank(unit));
	return body !== null && first?.call?.name === 'fontencoding' ? namedBy(first.call, body) : null;
}

export function wrappedEncoding(call: TreeCall): EncodingTable | null {
	return !ownMacroDefinition(call.name) && mandatoryArgs(call).length === 1 ? encodingSelectedBy(call.name) : null;
}
