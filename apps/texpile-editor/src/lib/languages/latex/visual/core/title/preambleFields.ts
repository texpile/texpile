// the commands in a preamble that set the title block, each with the text of its argument
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
	/** the whole command, for drawing it */
	from: number;
	to: number;
	/** the text of its argument, which an edit replaces */
	bodyFrom: number;
	bodyTo: number;
};

/** the title block's commands at the top level of `preamble`, in order */
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

/** where a field's text sits, by the bytes before and after it: held while its panel is open, so a half typed `\` that
 *  reads as escaping the closing brace cannot move the end */
export type PreambleSpan = { before: number; after: number };

export function spanOf(preamble: string, field: PreambleField): PreambleSpan {
	return { before: field.bodyFrom, after: preamble.length - field.bodyTo };
}

/** `preamble` with the text between the span's ends replaced and every other byte as it was */
export function replacePreambleSpan(preamble: string, span: PreambleSpan, text: string): string {
	if (span.before + span.after > preamble.length) return preamble;
	return preamble.slice(0, span.before) + text + preamble.slice(preamble.length - span.after);
}
