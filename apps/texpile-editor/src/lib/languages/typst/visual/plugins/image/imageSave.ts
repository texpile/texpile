// an image written back as the call the file had: bare, or the body of its figure
import type { Node } from 'prosemirror-model';
import {
	captionValue,
	figureSource,
	typStr,
	wrapInCrop,
	type Ctx,
	type TypstCrop,
	type TypstSaveCore
} from '$lib/languages/typst/visual/core/document';

function topLevelArgs(list: string): string[] {
	const args: string[] = [];
	const open: string[] = [];
	let quoted = false;
	let from = 0;
	for (let i = 0; i < list.length; i++) {
		const ch = list[i];
		const markup = open[open.length - 1] === '[';
		if (quoted) {
			if (ch === '\\') i++;
			else if (ch === '"') quoted = false;
		} else if (ch === '\\' && markup) i++;
		else if (ch === '"' && !markup) quoted = true;
		else if ('([{'.includes(ch)) open.push(ch);
		else if (')]}'.includes(ch)) open.pop();
		else if (ch === ',' && open.length === 0) {
			args.push(list.slice(from, i));
			from = i + 1;
		}
	}
	args.push(list.slice(from));
	return args;
}

export function imageSave(node: Node, ctx: Ctx, core: TypstSaveCore): string {
	const rawOpts = typeof node.attrs.options === 'string' ? node.attrs.options.trim() : '';
	let optsStr = rawOpts;
	// a drag-resize leaves snapped pixel width/maxWidth attrs (never set by the converter);
	// translate them to a percent of the text column, replacing any width: already carried.
	// wysiwym by design - the editor column stands in for the page width
	const w = Number(node.attrs.width);
	const max = Number(node.attrs.maxWidth);
	if (Number.isFinite(w) && Number.isFinite(max) && w > 0 && max > 0) {
		const pct = Math.min(100, Math.max(1, Math.round((w / max) * 100)));
		const rest = topLevelArgs(rawOpts)
			.map((s) => s.trim())
			.filter((s) => s && !/^width:/.test(s));
		optsStr = [`width: ${pct}%`, ...rest].join(', ');
	}
	const opts = optsStr ? `, ${optsStr}` : '';
	const img = wrapInCrop(`image(${typStr(String(node.attrs.src ?? ''))}${opts})`, (node.attrs.crop as TypstCrop | null) ?? null);
	const showCaption = node.attrs.showCaption !== false;
	const caption = showCaption ? core.bracketed(node) : '';
	const label = core.label(node);
	const written = figureSource(
		node.attrs.typFigure,
		{ body: img, caption: showCaption ? captionValue(node, core.bracketed) : null, label },
		core.fileIndent(node, ctx)
	);
	if (written != null) return written + '\n\n';
	if (node.attrs.numbered === false && !caption) return `#${img}${label}\n\n`;
	return `#figure(${img}${showCaption ? `, caption: [${caption}]` : ''})${label}\n\n`;
}
