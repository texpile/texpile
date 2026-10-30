import type { ShapeStyle, StyleFieldSet, StyleTarget } from '../../figure/figureLanguage';
import { styleFieldsOf } from '../../figure/styleFields';
import type { FigureEditorState } from '../editorState.svelte';
import type { ToolId } from '../editorState.types';
import { chosen, editEach } from './selectionCommands';

type StyleKey = keyof ShapeStyle;
/** `targets`: the kinds of shape among them, which say whether a color may be none */
export type SelectionStyle = { style: ShapeStyle; mixed: Set<StyleKey>; fields: StyleFieldSet; targets: Set<StyleTarget> };

const FIELD_OF: Record<StyleKey, keyof StyleFieldSet> = {
	stroke: 'stroke',
	fill: 'fill',
	width: 'width',
	dash: 'dash',
	arrows: 'arrows',
	textColor: 'text',
	textSize: 'text',
	opacity: 'opacity',
	corners: 'corners'
};
const DEFAULT_STYLE: ShapeStyle = {
	stroke: 'black',
	fill: null,
	width: 'thin',
	dash: 'solid',
	arrows: '',
	textColor: 'black',
	textSize: 'normalsize',
	opacity: '100',
	corners: 'sharp'
};

function shapeOf(tool: ToolId): { target: StyleTarget; open: boolean } | null {
	if (['box', 'diamond', 'oval', 'state', 'text'].includes(tool)) return { target: 'node', open: false };
	if (['line', 'arrow', 'curve', 'pen', 'axes'].includes(tool)) return { target: 'draw', open: true };
	if (['rect', 'ellipse', 'polygon'].includes(tool)) return { target: 'draw', open: false };
	return null;
}

/** the style the active tool's next shape takes, as the inspector shows it; text has no border, and a tool sets its own arrows */
export function nextShapeStyle(ed: FigureEditorState): SelectionStyle | null {
	const shape = shapeOf(ed.tool);
	if (!shape) return null;
	const fields = styleFieldsOf(shape.target, shape.open);
	const lined = ed.tool !== 'text';
	return {
		style: { ...DEFAULT_STYLE, ...ed.nextStyle },
		mixed: new Set(),
		fields: { ...fields, stroke: lined, width: lined, dash: lined, arrows: false },
		targets: new Set([shape.target])
	};
}

/** what a change sets on a shape with these fields */
export function applicableChange(change: Partial<ShapeStyle>, fields: StyleFieldSet) {
	return Object.fromEntries(Object.entries(change).filter(([k]) => fields[FIELD_OF[k as StyleKey]])) as Partial<ShapeStyle>;
}

/** the selected shapes' style: each field any of them takes, mixed where they differ */
export function selectionStyle(ed: FigureEditorState): SelectionStyle | null {
	const styled = chosen(ed).flatMap((st) => {
		const described = ed.language.describe(ed.source, st);
		const style = described.target ? ed.language.readStyle(ed.source, st) : null;
		return described.target && style ? [{ style, target: described.target, fields: described.fields }] : [];
	});
	if (!styled.length) return null;
	const style = { ...styled[0].style };
	const mixed = new Set<StyleKey>();
	for (const key of Object.keys(FIELD_OF) as StyleKey[]) {
		const values = styled.filter((s) => s.fields[FIELD_OF[key]]).map((s) => s.style[key]);
		if (values.length) Object.assign(style, { [key]: values[0] });
		if (values.some((v) => v !== values[0])) mixed.add(key);
	}
	const fields = Object.fromEntries(
		Object.keys(styled[0].fields).map((f) => [f, styled.some((s) => s.fields[f as keyof StyleFieldSet])])
	) as StyleFieldSet;
	return { style, mixed, fields, targets: new Set(styled.map((s) => s.target)) };
}

/**
 * each selected shape takes what it has a field for; a node with no border keeps none when several are styled, and
 * the next shape drawn takes the style too, as Excalidraw's does
 */
export function styleSelection(ed: FigureEditorState, change: Partial<ShapeStyle>) {
	const several = chosen(ed).length > 1;
	const next = editEach(ed.source, chosen(ed), (text, st) => {
		const described = ed.language.describe(text, st);
		if (!described.target) return null;
		const borderless = several && described.target === 'node' && ed.language.readStyle(text, st)?.stroke === null;
		const own = applicableChange(change, { ...described.fields, stroke: described.fields.stroke && !borderless });
		return Object.keys(own).length ? ed.language.writeStyle(text, st, own) : null;
	});
	ed.pickNextStyle(change);
	ed.applyIfChanged(next);
}

/** a shape just added, `i` in `text`, in the style the next shape takes; its tool sets its own arrows, and text has no border */
export function inNextStyle(ed: FigureEditorState, text: string, i: number, tool: string) {
	const st = ed.language.readPicture(text, ed.shownIndex)?.statements.find((s) => s.i === i);
	const described = st && ed.language.describe(text, st);
	if (!st || !described?.target) return text;
	const lined = tool !== 'text';
	const fields = { ...described.fields, arrows: false, stroke: lined, width: lined, dash: lined };
	const own = applicableChange(ed.nextStyle, fields);
	return Object.keys(own).length ? (ed.language.writeStyle(text, st, own) ?? text) : text;
}

// the style Copy style took, which Paste style gives the selection
let copiedStyle: Partial<ShapeStyle> | null = null;

/** the selection's style, the fields its shapes have and agree on; a node's has no arrows to take off an arrow */
export function copyStyle(ed: FigureEditorState) {
	const shown = selectionStyle(ed);
	if (!shown) return;
	copiedStyle = Object.fromEntries(
		Object.entries(shown.style).filter(([k]) => shown.fields[FIELD_OF[k as StyleKey]] && !shown.mixed.has(k as StyleKey))
	);
}

export function canPasteStyle() {
	return copiedStyle !== null;
}

export function pasteStyle(ed: FigureEditorState) {
	if (copiedStyle) styleSelection(ed, copiedStyle);
}
