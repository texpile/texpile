import type { Node } from 'prosemirror-model';
import type { SyntaxNode } from '@lezer/common';
import { namedArg, positionalArgs, readTypstCall, type CallArg, type TypstCall } from '../../core/reading/typstCall';
import { typstColorCss } from '../css/typstColor';
import { typstLengthCss, typstSidesCss } from '../css/typstLengthCss';
import { typstTextDeclarations } from '../css/typstTextStyle';

export type LayoutKind = 'align' | 'block' | 'box' | 'columns' | 'quote' | 'grid' | 'text';

export type LayoutDrawing = {
	kind: LayoutKind;
	style: Record<string, string>;
	bodyStyle: Record<string, string>;
	attribution: string | null;
};

const KINDS: readonly string[] = ['align', 'block', 'box', 'columns', 'quote', 'text'];
const TRAILING_SEPARATOR = /[,\s]*$/;

export function layoutKindOf(node: Node): LayoutKind | null {
	if (node.type.name === 'typ_grid') return 'grid';
	return node.type.name === 'typ_env' && KINDS.includes(String(node.attrs.name)) ? (node.attrs.name as LayoutKind) : null;
}

export function layoutHeadSource(node: Node): string {
	const args = typeof node.attrs.args === 'string' ? node.attrs.args : '';
	return `#${node.type.name === 'typ_grid' ? 'grid' : String(node.attrs.name)}(${node.type.name === 'typ_grid' ? args.replace(TRAILING_SEPARATOR, '') : args})`;
}

export function layoutAttrsFor(node: Node, name: string, args: string | null): Record<string, unknown> | null {
	if (node.type.name !== 'typ_grid') return { ...node.attrs, name, args };
	if (name !== 'grid') return null;
	const text = (args ?? '').replace(TRAILING_SEPARATOR, '');
	const separator = TRAILING_SEPARATOR.exec(String(node.attrs.args ?? ''))?.[0] || ', ';
	return { ...node.attrs, args: text ? text + separator : '' };
}

const HORIZONTAL: Record<string, string> = { left: 'left', center: 'center', right: 'right', start: 'start', end: 'end' };

export function horizontalAlignment(value: string): string | null {
	for (const part of value.split('+')) {
		const word = HORIZONTAL[part.trim()];
		if (word) return word;
	}
	return null;
}

export function withHorizontal(value: string, horizontal: string): string {
	const rest = value
		.split('+')
		.map((part) => part.trim())
		.filter((part) => part && !HORIZONTAL[part]);
	return [horizontal, ...rest].join(' + ');
}

function colorOf(call: TypstCall, arg: CallArg | null): string | null {
	return arg ? typstColorCss(arg.node, call.source) : null;
}

function lengthOf(call: TypstCall, arg: CallArg | null): string | null {
	return arg ? typstLengthCss(arg.node, call.source) : null;
}

export function strokeCss(call: TypstCall, arg: CallArg): string | null {
	if (arg.kind === 'None') return 'none';
	const parts: SyntaxNode[] = arg.kind === 'Binary' ? [] : [arg.node];
	if (arg.kind === 'Binary') {
		for (let c = arg.node.firstChild; c; c = c.nextSibling) if (c.name !== 'Space' && c.name !== 'Plus') parts.push(c);
	}
	if (parts.length > 2) return null;
	let width: string | null = null;
	let color: string | null = null;
	for (const part of parts) {
		const asLength = typstLengthCss(part, call.source);
		const asColor = asLength ? null : typstColorCss(part, call.source);
		if (asLength && !width) width = asLength;
		else if (asColor && !color) color = asColor;
		else return null;
	}
	return `${width ?? '1pt'} solid ${color ?? 'black'}`;
}

export function blockStyle(call: TypstCall): Record<string, string> {
	const style: Record<string, string> = {};
	const fill = colorOf(call, namedArg(call, 'fill'));
	if (fill) style.background = fill;
	const inset = namedArg(call, 'inset');
	const sides = inset ? typstSidesCss(inset.node, call.source) : null;
	if (sides) style.padding = sides;
	const stroke = namedArg(call, 'stroke');
	const border = stroke ? strokeCss(call, stroke) : null;
	if (border) style.border = border;
	const radius = lengthOf(call, namedArg(call, 'radius'));
	if (radius) style.borderRadius = radius;
	const width = lengthOf(call, namedArg(call, 'width'));
	if (width) style.width = width;
	const height = lengthOf(call, namedArg(call, 'height'));
	if (height) style.minHeight = height;
	const above = lengthOf(call, namedArg(call, 'above') ?? namedArg(call, 'spacing'));
	if (above) style.marginTop = above;
	const below = lengthOf(call, namedArg(call, 'below') ?? namedArg(call, 'spacing'));
	if (below) style.marginBottom = below;
	return style;
}

function quoteText(arg: CallArg | null): string | null {
	if (!arg) return null;
	if (arg.kind === 'ContentBlock') return arg.value.slice(1, -1).trim() || null;
	return arg.kind === 'Str' ? arg.value.slice(1, -1) : arg.value;
}

const AUTO_TRACK = 'minmax(4ch, auto)';
const MOST_COLUMNS = 24;

function trackCss(node: SyntaxNode, source: string): string {
	const text = source.slice(node.from, node.to);
	if (node.name === 'Numeric' && text.endsWith('fr')) return `minmax(0, ${text})`;
	return typstLengthCss(node, source) ?? AUTO_TRACK;
}

export function columnsCss(call: TypstCall, arg: CallArg | null): string | null {
	if (!arg) return null;
	if (arg.kind === 'Int') {
		const count = Math.min(MOST_COLUMNS, Number.parseInt(arg.value, 10));
		return count > 0 ? `repeat(${count}, ${AUTO_TRACK})` : null;
	}
	if (arg.kind === 'Array') {
		const tracks: string[] = [];
		for (let c = arg.node.firstChild; c; c = c.nextSibling) {
			if (['Space', 'Comma', 'LeftParen', 'RightParen'].includes(c.name)) continue;
			tracks.push(trackCss(c, call.source));
		}
		return tracks.length ? tracks.slice(0, MOST_COLUMNS).join(' ') : null;
	}
	return arg.kind === 'Auto' || arg.kind === 'Numeric' ? trackCss(arg.node, call.source) : null;
}

function gridStyle(call: TypstCall): Record<string, string> {
	const style: Record<string, string> = { gridTemplateColumns: columnsCss(call, namedArg(call, 'columns')) ?? AUTO_TRACK };
	const gutter = lengthOf(call, namedArg(call, 'gutter'));
	const column = lengthOf(call, namedArg(call, 'column-gutter')) ?? gutter;
	const row = lengthOf(call, namedArg(call, 'row-gutter')) ?? gutter;
	if (column) style.columnGap = column;
	if (row) style.rowGap = row;
	const inset = namedArg(call, 'inset');
	const padding = inset ? typstSidesCss(inset.node, call.source) : null;
	if (padding) style['--typ-grid-inset'] = padding;
	return style;
}

export function layoutDrawing(kind: LayoutKind, node: Node): LayoutDrawing {
	const drawing: LayoutDrawing = { kind, style: {}, bodyStyle: {}, attribution: null };
	const call = readTypstCall(layoutHeadSource(node));
	if (!call) return drawing;
	const [first] = positionalArgs(call);
	if (kind === 'align') {
		const align = first ? horizontalAlignment(first.value) : null;
		if (align) drawing.style.textAlign = align;
	} else if (kind === 'block' || kind === 'box') {
		drawing.style = blockStyle(call);
	} else if (kind === 'columns') {
		const count = first && first.kind === 'Int' ? Number.parseInt(first.value, 10) : 0;
		if (count > 1) drawing.bodyStyle.columnCount = String(count);
		drawing.bodyStyle.columnGap = lengthOf(call, namedArg(call, 'gutter')) ?? '4pt';
	} else if (kind === 'text') {
		drawing.bodyStyle = typstTextDeclarations(String(node.attrs.args ?? ''));
	} else if (kind === 'grid') {
		drawing.bodyStyle = gridStyle(call);
	} else {
		drawing.attribution = quoteText(namedArg(call, 'attribution'));
	}
	return drawing;
}
