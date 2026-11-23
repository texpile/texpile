// createTestCanvasView with the real layout and geometry over the fixed measurer, for tests that move the caret across lines
import type { EditorState } from 'prosemirror-state';
import type { CanvasView } from '$lib/editor/canvas';
import { createCanvasGeometry } from '$lib/editor/canvas/geometry/canvasGeometry';
import { layoutBlock } from '$lib/editor/canvas/layout/layoutElement';
import { ViewLineBreaking } from '$lib/editor/canvas/layout/linebreak/viewBreaking';
import { testMetrics } from '../layout/layoutFixture';
import { monoMeasure } from './monoMeasure';
import { createTestCanvasView, type TestCanvasViewOptions } from './testCanvasView';

const tools = { measure: monoMeasure, metrics: testMetrics };

/** a 16 px mono face: 9.6 px a character, 24 px a line; `width` 200 breaks a line after 20 characters */
export function createLaidOutTestView(state: EditorState, options: TestCanvasViewOptions = {}): CanvasView {
	return createTestCanvasView(state, {
		width: 200,
		...options,
		engine: {
			layoutBlock: (request) => layoutBlock(request, tools),
			createGeometry: (model) => createCanvasGeometry(model, tools),
			createBreaking: () => new ViewLineBreaking(() => 'none'),
			...options.engine
		}
	});
}

export const ADVANCE = 9.6;
export const LINE_HEIGHT = 24;
