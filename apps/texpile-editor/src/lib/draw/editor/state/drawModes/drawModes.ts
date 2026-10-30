import type { ToolId } from '../editorState.types';

/** how a rectangle is drawn, as CAD sketchers offer it */
export type RectMode = 'corners' | 'center' | 'threePoints';
/** how an ellipse or a circle is drawn */
export type RoundMode = 'corners' | 'center' | 'circleCenter' | 'circleTwoPoints' | 'circleThreePoints';
export type DrawMode = RectMode | RoundMode;
export type ShapeFamily = 'rect' | 'round';
export type DrawModes = { rect: RectMode; round: RoundMode };

/** `steps`: what each click places, as CAD's prompt line says it */
export type DrawModeEntry = { mode: DrawMode; label: string; steps: string[] };

export const DRAW_MODES: Record<ShapeFamily, DrawModeEntry[]> = {
	rect: [
		{ mode: 'corners', label: 'Corner to corner', steps: ['Click a corner', 'Click the opposite corner'] },
		{ mode: 'center', label: 'From the center', steps: ['Click the center', 'Click a corner'] },
		{
			mode: 'threePoints',
			label: 'Three points',
			steps: ['Click where one side starts', 'Click where it ends', 'Click how far the opposite side is']
		}
	],
	round: [
		{ mode: 'corners', label: 'Corner to corner', steps: ['Click a corner of the box around it', 'Click the opposite corner'] },
		{ mode: 'center', label: 'From the center', steps: ['Click the center', 'Click a corner of the box around it'] },
		{ mode: 'circleCenter', label: 'Circle from the center', steps: ['Click the center', 'Click a point on the circle'] },
		{ mode: 'circleTwoPoints', label: 'Circle by 2 points', steps: ['Click one end of a diameter', 'Click the other end'] },
		{
			mode: 'circleThreePoints',
			label: 'Circle by 3 points',
			steps: ['Click a point on the circle', 'Click a second point', 'Click a third point']
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

/** the points a mode takes, pressed or clicked */
export function pointsNeeded(mode: DrawMode | undefined) {
	return mode === 'threePoints' || mode === 'circleThreePoints' ? 3 : 2;
}
