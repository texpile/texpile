import { m } from '$lib/paraglide/messages';
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
	name: () => string;
	label: () => string;
	key: string;
	digit?: string;
	icon: Component<{ size?: number; class?: string }>;
	feature?: FigureFeature;
};

/** on the rail, in order; null is a divider. Letters and numbers follow Excalidraw's where it has the tool */
export const TOOLS: (ToolEntry | null)[] = [
	{ id: 'hand', name: () => m.figure_tool_hand(), label: () => m.figure_tool_hand_label(), key: 'H', icon: Hand },
	{ id: 'select', name: () => m.figure_tool_select(), label: () => m.figure_tool_select(), key: 'V', digit: '1', icon: MousePointer2 },
	null,
	{ id: 'box', name: () => m.figure_tool_box(), label: () => m.figure_tool_box_label(), key: 'R', digit: '2', icon: Square },
	{ id: 'diamond', name: () => m.figure_tool_diamond(), label: () => m.figure_tool_diamond(), key: 'D', digit: '3', icon: Diamond },
	{ id: 'oval', name: () => m.figure_tool_oval(), label: () => m.figure_tool_oval(), key: 'O', digit: '4', icon: Circle },
	{ id: 'arrow', name: () => m.figure_tool_arrow(), label: () => m.figure_tool_arrow(), key: 'A', digit: '5', icon: MoveUpRight },
	{ id: 'line', name: () => m.figure_tool_line(), label: () => m.figure_tool_line(), key: 'L', digit: '6', icon: Slash },
	{ id: 'pen', name: () => m.figure_tool_pen(), label: () => m.figure_tool_pen(), key: 'P', digit: '7', icon: Pencil },
	{ id: 'text', name: () => m.figure_tool_text(), label: () => m.figure_tool_text(), key: 'T', digit: '8', icon: Type },
	null,
	{
		id: 'dimension',
		name: () => m.figure_tool_dimension(),
		label: () => m.figure_tool_dimension_label(),
		key: 'M',
		icon: RulerDimensionLine,
		feature: 'dimensions'
	},
	{
		id: 'trim',
		name: () => m.figure_tool_trim(),
		label: () => m.figure_tool_trim_label(),
		key: 'W',
		icon: Scissors,
		feature: 'trim'
	}
];

/** the rest, behind the rail's More tools menu as Excalidraw keeps its extra ones */
export const MORE_TOOLS: ToolEntry[] = [
	{ id: 'curve', name: () => m.figure_tool_curve(), label: () => m.figure_tool_curve(), key: 'U', icon: Spline },
	{
		id: 'state',
		name: () => m.figure_tool_state(),
		label: () => m.figure_tool_state_label(),
		key: 'S',
		icon: CircleDot,
		feature: 'states'
	},
	{ id: 'plot', name: () => m.figure_tool_plot(), label: () => m.figure_tool_plot_label(), key: 'K', icon: ChartSpline, feature: 'plots' },
	{
		id: 'component',
		name: () => m.figure_tool_component(),
		label: () => m.figure_tool_component_label(),
		key: 'E',
		icon: Zap,
		feature: 'circuits'
	},
	{ id: 'rect', name: () => m.figure_tool_rect(), label: () => m.figure_tool_rect_label(), key: 'B', icon: RectangleHorizontal },
	{ id: 'ellipse', name: () => m.figure_tool_ellipse(), label: () => m.figure_tool_ellipse_label(), key: 'C', icon: CircleDashed },
	{ id: 'polygon', name: () => m.figure_tool_polygon(), label: () => m.figure_tool_polygon_label(), key: 'G', icon: Pentagon },
	{ id: 'axes', name: () => m.figure_tool_axes(), label: () => m.figure_tool_axes_label(), key: 'X', icon: Axis3d }
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
