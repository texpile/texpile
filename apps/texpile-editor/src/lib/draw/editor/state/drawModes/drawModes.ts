import { m } from '$lib/paraglide/messages';
import type { ToolId } from '../editorState.types';

export type RectMode = 'corners' | 'center' | 'threePoints';
export type RoundMode = 'corners' | 'center' | 'circleCenter' | 'circleTwoPoints' | 'circleThreePoints';
export type DrawMode = RectMode | RoundMode;
export type ShapeFamily = 'rect' | 'round';
export type DrawModes = { rect: RectMode; round: RoundMode };

export type DrawModeEntry = { mode: DrawMode; label: () => string; steps: (() => string)[] };

export const DRAW_MODES: Record<ShapeFamily, DrawModeEntry[]> = {
	rect: [
		{
			mode: 'corners',
			label: () => m.figure_mode_corners(),
			steps: [() => m.figure_step_corner(), () => m.figure_step_opposite_corner()]
		},
		{ mode: 'center', label: () => m.figure_mode_center(), steps: [() => m.figure_step_center(), () => m.figure_step_corner()] },
		{
			mode: 'threePoints',
			label: () => m.figure_mode_three_points(),
			steps: [() => m.figure_step_side_start(), () => m.figure_step_side_end(), () => m.figure_step_side_far()]
		}
	],
	round: [
		{
			mode: 'corners',
			label: () => m.figure_mode_corners(),
			steps: [() => m.figure_step_box_corner(), () => m.figure_step_opposite_corner()]
		},
		{ mode: 'center', label: () => m.figure_mode_center(), steps: [() => m.figure_step_center(), () => m.figure_step_box_corner()] },
		{
			mode: 'circleCenter',
			label: () => m.figure_mode_circle_center(),
			steps: [() => m.figure_step_center(), () => m.figure_step_circle_point()]
		},
		{
			mode: 'circleTwoPoints',
			label: () => m.figure_mode_circle_two_points(),
			steps: [() => m.figure_step_diameter_end(), () => m.figure_step_other_end()]
		},
		{
			mode: 'circleThreePoints',
			label: () => m.figure_mode_circle_three_points(),
			steps: [() => m.figure_step_circle_point(), () => m.figure_step_second_point(), () => m.figure_step_third_point()]
		}
	]
};

export const DEFAULT_DRAW_MODES: DrawModes = { rect: 'corners', round: 'corners' };

const FAMILIES: Partial<Record<ToolId, ShapeFamily>> = { box: 'rect', diamond: 'rect', rect: 'rect', oval: 'round', ellipse: 'round' };

export function familyOf(tool: ToolId): ShapeFamily | null {
	return FAMILIES[tool] ?? null;
}

export function drawModeEntry(mode: DrawMode, family: ShapeFamily) {
	return DRAW_MODES[family].find((e) => e.mode === mode) ?? DRAW_MODES[family][0];
}

export function pointsNeeded(mode: DrawMode | undefined) {
	return mode === 'threePoints' || mode === 'circleThreePoints' ? 3 : 2;
}
