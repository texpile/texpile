import type { TitlePart } from '$lib/languages/latex/knowledge/types';
import type { PackageTable } from '$lib/languages/latex/parser/signatures/packageTable';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { sourceUnitsIn } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import { bodyOf } from '$lib/languages/latex/parser/tree/walk/stretch';
import { signatureIn } from '$lib/languages/latex/titleParts';
import { titleReading } from './titleReading';

export type PreambleField = {
	name: string;
	part: TitlePart;
	from: number;
	to: number;
	bodyFrom: number;
	bodyTo: number;
};

export function preambleFields(preamble: string, table: PackageTable): PreambleField[] {
	const units = sourceUnitsIn(preamble, bodyOf(latexTreeOf(preamble).topNode), (name) => signatureIn(table, name));
	return units.flatMap(({ call }) => {
		const reading = call && titleReading(call, table);
		return call && reading?.text.body
			? [
					{
						name: call.name,
						part: reading.part,
						from: call.from,
						to: call.to,
						bodyFrom: reading.text.body.from,
						bodyTo: reading.text.body.to
					}
				]
			: [];
	});
}

export type PreambleSpan = { before: number; after: number };

export function spanOf(preamble: string, field: PreambleField): PreambleSpan {
	return { before: field.bodyFrom, after: preamble.length - field.bodyTo };
}

export function replacePreambleSpan(preamble: string, span: PreambleSpan, text: string): string {
	if (span.before + span.after > preamble.length) return preamble;
	return preamble.slice(0, span.before) + text + preamble.slice(preamble.length - span.after);
}
