// C2's engine for one window (D34): styles, layout, geometry and painter behind C1's CanvasEngine
import { templateFeaturesStore } from '$lib/stores/editorStore';
import type { CanvasGeometry } from '../contracts/geometryTypes';
import { windowInvalidation } from '../document/invalidation';
import { createCanvasGeometry } from '../geometry/canvasGeometry';
import { layoutBlock } from '../layout/layoutElement';
import { ViewLineBreaking } from '../layout/linebreak/viewBreaking';
import { layoutSource } from '../layout/sourceLayout';
import { windowFontMetrics } from '../layout/text/fontMetrics';
import { FORMULA_FONTS, loadFonts, watchFontLoads } from '../layout/text/fontLoading';
import { windowTextMeasure } from '../layout/text/textMeasure';
import { windowFormulaLayouts } from '../math/mathLayoutCache';
import { createCanvasPainter } from '../paint/painter';
import { CanvasViewStyles } from '../style/viewStyles';
import { inlineHitChain } from '../tree/inlineHitChain';
import type { CanvasEngine, DocumentModel } from '../contracts/engineTypes';

function documentLanguage(): string {
	const language = templateFeaturesStore.current.hyphenationLanguage;
	return !language || language === 'none' ? 'en-us' : language;
}

export function createCanvasEngine(win: Window & typeof globalThis): CanvasEngine {
	const measure = windowTextMeasure(win);
	const metrics = windowFontMetrics(win);
	const tools = { measure, metrics };
	const styles = new WeakMap<HTMLElement, CanvasViewStyles>();
	if (win.document.fonts)
		watchFontLoads(win.document.fonts, (families) => {
			measure.forget(families);
			metrics.forget(families);
			windowFormulaLayouts(win).forget();
		});

	function geometryOf(model: DocumentModel): CanvasGeometry {
		return createCanvasGeometry(model, { ...tools, language: documentLanguage, inlineChain: inlineHitChain });
	}

	return {
		measure,
		createStyles(setup) {
			const made = new CanvasViewStyles(setup);
			styles.set(setup.root, made);
			return made;
		},
		layoutBlock: (request) => layoutBlock(request, tools),
		layoutSource: (request, error) => layoutSource(request, error, tools),
		createGeometry: geometryOf,
		createBreaking() {
			const breaking = new ViewLineBreaking(() => templateFeaturesStore.current.hyphenationLanguage);
			breaking.onPatterns(() => windowInvalidation(win).fire({ kind: 'epoch', name: 'hyphenation' }));
			return breaking;
		},
		createPainter(model, repaintCarets) {
			const viewStyles = styles.get(model.view.dom);
			if (!viewStyles) throw new Error('the view made no styles before its painter');
			return createCanvasPainter(model, repaintCarets, {
				...tools,
				ligatureBreak: measure.ligatureBreak,
				styles: viewStyles,
				geometry: geometryOf(model),
				ground: () => viewStyles.ground()
			});
		},
		loadFonts: (fonts) => loadFonts(win.document.fonts, [...fonts, ...FORMULA_FONTS])
	};
}
