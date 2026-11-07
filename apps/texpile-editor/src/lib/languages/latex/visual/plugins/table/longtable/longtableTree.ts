// what a longtable has beyond a grid: the markers that end its repeating head and foot, and the caption row
import {
	argText,
	argTextContent,
	createDefaultContext,
	hasStar,
	isBlankUnit,
	mandatoryArgs,
	noteBlockSpan,
	optionalArg,
	type ImportCall,
	type PmNode,
	type TreeEnvironment,
	type TreeImport,
	type Unit
} from '$lib/languages/latex/visual/core/document';

export type CaptionCalls = { call: ImportCall; labels: string[] };

export type CaptionRow = CaptionCalls & {
	/** the rules before the row, what followed its \\, and the number of grid rows before it */
	top: string;
	suffix: string;
	at: number;
	end: string;
};

/** a marker and the rules before it, a line each after what the row already ends with */
export function endedBy(end: string, rules: string, marker: string): string {
	return `${end}${end ? '\n' : ''}${rules ? rules + '\n' : ''}\\${marker}`;
}

/** the \caption and \label calls when they are all a row holds */
export function captionCallsIn(im: TreeImport, units: Unit[]): CaptionCalls | null {
	const meaningful = units.filter((u) => !isBlankUnit(u));
	const call = meaningful[0]?.call;
	if (call?.name !== 'caption' || !mandatoryArgs(call).some((a) => a.body && a.body.to > a.body.from)) return null;
	const rest = meaningful.slice(1);
	if (rest.some((u) => u.call?.name !== 'label')) return null;
	return { call, labels: rest.map((u) => argTextContent(im, mandatoryArgs(u.call!)[0])).filter((l): l is string => !!l) };
}

/** the table as a wrapper whose caption is the row the longtable holds, numbered as a table float is */
export function captionedLongtable(im: TreeImport, env: TreeEnvironment, row: CaptionRow, table: PmNode): PmNode {
	const arg = mandatoryArgs(row.call).find((a) => a.body)!;
	const short = optionalArg(row.call);
	const caption = noteBlockSpan(
		im.core.node(
			'table_caption',
			{
				starred: hasStar(row.call),
				captionOpt: short ? argText(im.src, short) : null,
				rowAt: row.at,
				rowTop: row.top,
				rowSuffix: row.suffix,
				rowEnd: row.end
			},
			im.core.inline(arg.body!, createDefaultContext())
		),
		{ srcFrom: arg.body!.from, srcTo: arg.body!.to, size: 1 }
	);
	return im.core.node(
		'table_wrapper',
		{
			label: row.labels.length ? row.labels[row.labels.length - 1] : null,
			extraLabels: row.labels.length > 1 ? row.labels.slice(0, -1).join('\n') : null,
			showNotes: false,
			placement: '',
			centering: false
		},
		[caption, noteBlockSpan(table, { srcFrom: env.from, srcTo: env.to, size: 1 })]
	);
}
