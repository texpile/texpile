import type { FigureLanguage } from '../../figure/figureLanguage';
import { sourcePoint } from '../../figure/geometry';
import { formatNumber } from '../../figure/numbers';
import type { DimensionPlacement, DimensionTarget } from './dimensionTargets.types';
import { angleParts, turnedEnd, writtenOnDirection } from './geometry/angleGeometry';
import { dimensionEnds, dimensionValue, stretchedEnd } from './geometry/dimensionGeometry';

// pgfplots' own: 240pt by 207pt
const PLOT_WIDTH_CM = 8.43;
const PLOT_HEIGHT_CM = 7.27;

/** the source with the dimension, as put, set to `value`: cm on the paper, an angle's degrees; null where it cannot be */
export function dimensionedSource(
	language: FigureLanguage,
	source: string,
	t: DimensionTarget,
	placed: DimensionPlacement,
	value: number
): string | null {
	if (t.kind === 'angle') {
		const parts = placed.orient === 'angle' ? angleParts(t.from, t.to, placed.rays) : null;
		if (!parts || !(value > 0 && value < 180)) return null;
		const to = writtenOnDirection(sourcePoint(...parts.pivot, t.to.m), sourcePoint(...turnedEnd(parts, value), t.to.m));
		return language.movePoint(source, t.to.points, parts.turning, to);
	}
	const now = dimensionValue(t, placed);
	if (!(value > 0) || !(now > 0)) return null;
	if (t.kind === 'radius') return source.slice(0, t.radius.from) + formatNumber(t.radius.value * (value / now)) + source.slice(t.radius.to);
	const across = t.kind === 'side' ? t.axis : placed.orient === 'x' || placed.orient === 'y' ? placed.orient : 'aligned';
	if (t.kind === 'node') {
		// pgfplots fits a plot to its width and height only roughly, so they change by what the drawing is short of
		if (t.st.kind === 'axis') {
			const axis = language.readAxis(source, t.st);
			if (across === 'y') return language.writeAxis(source, t.st, { height: (axis?.height ?? PLOT_HEIGHT_CM) + value - now });
			return language.writeAxis(source, t.st, { width: (axis?.width ?? PLOT_WIDTH_CM) + value - now });
		}
		return language.writeNodeBox(source, t.st, t.round ? { w: value, h: value } : across === 'y' ? { h: value } : { w: value });
	}
	const [p, q] = dimensionEnds(t, placed);
	if (t.kind === 'distance') return language.movePoint(source, t.to.points, t.to.k, stretchedEnd(p, q, across, value, t.to.m));
	return language.movePoint(source, t.points, t.b, stretchedEnd(p, q, across, value, t.m));
}
