import type { TitlePart } from '$lib/languages/latex/knowledge/types';
import type { TreeArg, TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import { signatureIn, titlePartOf } from '$lib/languages/latex/titleParts';
import type { PackageTable } from '$lib/languages/latex/parser/signatures/packageTable';
import { documentTable } from './documentTable.svelte';

export type TitleReading = {
	part: TitlePart;
	text: TreeArg;
	named: string | null;
	mark: TreeArg | null;
};

export function titleReading(call: TreeCall, table: PackageTable = documentTable.current): TitleReading | null {
	const signature = signatureIn(table, call.name);
	if (!signature) return null;
	const at = signature.findIndex((arg) => titlePartOf(arg) !== null && titlePartOf(arg) !== 'mark');
	const markAt = signature.findIndex((arg, i) => i !== at && titlePartOf(arg) === 'mark');
	const textAt = at >= 0 ? at : markAt;
	const text = call.args[textAt];
	if (textAt < 0 || !text?.present || !text.body) return null;
	const mark = at >= 0 && markAt >= 0 ? call.args[markAt] : undefined;
	return {
		part: titlePartOf(signature[textAt])!,
		text,
		named: signature[textAt].placeholder ?? null,
		mark: mark?.present && mark.body ? mark : null
	};
}

export function noteArgument(call: TreeCall): TreeArg | null {
	const signature = signatureIn(documentTable.current, call.name);
	const at = signature?.findIndex((arg) => arg.part === 'footnote') ?? -1;
	const arg = at >= 0 ? call.args[at] : undefined;
	return arg?.present && arg.body ? arg : null;
}
