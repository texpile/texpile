import {
	Axis3d,
	ChartSpline,
	Hand,
	Circle,
	CircleDashed,
	CircleDot,
	Diamond,
	MousePointer2,
	MoveUpRight,
	Pencil,
	Pentagon,
	RectangleHorizontal,
	RulerDimensionLine,
	Scissors,
	Slash,
	Spline,
	Square,
	Type,
	Zap
} from '@lucide/svelte';
import type { Component } from 'svelte';
import type { FigureFeature, FigureLanguage, NodeShape } from '../figure/figureLanguage';
import type { ToolId } from '../state/editorState.types';

/** `digit`: Excalidraw's number for the tool, a second key for it */
export type ToolEntry = {
	id: ToolId;
	label: string;
	key: string;
	digit?: string;
	icon: Component<{ size?: number; class?: string }>;
	feature?: FigureFeature;
};

/** on the rail, in order; null is a divider. Letters and numbers follow Excalidraw's where it has the tool */
export const TOOLS: (ToolEntry | null)[] = [
	{ id: 'hand', label: 'Hand, drag to move the view', key: 'H', icon: Hand },
	{ id: 'select', label: 'Select', key: 'V', digit: '1', icon: MousePointer2 },
	null,
	{ id: 'box', label: 'Rectangle, text in an outline that arrows connect to', key: 'R', digit: '2', icon: Square },
	{ id: 'diamond', label: 'Diamond', key: 'D', digit: '3', icon: Diamond },
	{ id: 'oval', label: 'Ellipse', key: 'O', digit: '4', icon: Circle },
	{ id: 'arrow', label: 'Arrow', key: 'A', digit: '5', icon: MoveUpRight },
	{ id: 'line', label: 'Line', key: 'L', digit: '6', icon: Slash },
	{ id: 'pen', label: 'Pen', key: 'P', digit: '7', icon: Pencil },
	{ id: 'text', label: 'Text', key: 'T', digit: '8', icon: Type },
	null,
	{
		id: 'dimension',
		label: 'Dimension, click a line, a side, a circle or two points and type its size',
		key: 'M',
		icon: RulerDimensionLine,
		feature: 'dimensions'
	},
	{
		id: 'trim',
		label: 'Trim, click the piece of a line, a box or a circle to cut it away where others cross it',
		key: 'W',
		icon: Scissors,
		feature: 'trim'
	}
];

/** the rest, behind the rail's More tools menu as Excalidraw keeps its extra ones */
export const MORE_TOOLS: ToolEntry[] = [
	{ id: 'curve', label: 'Curve', key: 'U', icon: Spline },
	{ id: 'state', label: 'State, for a state machine', key: 'S', icon: CircleDot, feature: 'states' },
	{ id: 'plot', label: 'Plot, an axis with a function to start from', key: 'K', icon: ChartSpline, feature: 'plots' },
	{ id: 'component', label: 'Component, a circuit part picked in the panel', key: 'E', icon: Zap, feature: 'circuits' },
	{ id: 'rect', label: 'Rectangle path, lines with no text in them', key: 'B', icon: RectangleHorizontal },
	{ id: 'ellipse', label: 'Ellipse path, Shift for a circle', key: 'C', icon: CircleDashed },
	{ id: 'polygon', label: 'Polygon, click the first point or press Enter to close', key: 'G', icon: Pentagon },
	{ id: 'axes', label: 'Axes, drag from where they cross', key: 'X', icon: Axis3d }
];

/** the outline each node tool draws */
export const NODE_TOOL_SHAPES: Partial<Record<ToolId, NodeShape>> = { box: 'rectangle', diamond: 'diamond', oval: 'ellipse' };

/** the rail's tools with a menu of the ways they draw, as CAD's flyouts have */
export const MODE_MENU_TOOLS = new Set<ToolId>(['box', 'oval']);

/** the tools that draw nothing, which a diagram or a tree keeps */
export const VIEW_TOOLS = new Set<ToolId>(['hand', 'select']);

/** every tool, on the rail and behind More tools */
export const ALL_TOOLS: ToolEntry[] = [...TOOLS.filter((t) => t !== null), ...MORE_TOOLS];

export function isOffered(tool: ToolEntry, language: FigureLanguage) {
	return !tool.feature || language.features.includes(tool.feature);
}

/** the rail's tools the language backs, with no divider left at the end or next to another */
export function railTools(language: FigureLanguage) {
	const kept = TOOLS.filter((t) => t === null || isOffered(t, language));
	return kept.filter((t, n) => t !== null || (n < kept.length - 1 && kept[n + 1] !== null));
}
