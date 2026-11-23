// translate, rotate and scale about the box's origin, and vertical writing as a box turned a quarter (5.1)
import type { DocRect } from '../contracts/layoutTypes';
import type { ComputedStyle, LayoutStyle } from '../contracts/styleTypes';

/** a 2D matrix as canvas setTransform takes it: a, b, c, d, e, f */
export type TransformMatrix = readonly [number, number, number, number, number, number];

function multiply(left: TransformMatrix, right: TransformMatrix): TransformMatrix {
	const [a, b, c, d, e, f] = left;
	const [g, h, i, j, k, l] = right;
	return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
}

/** a matrix given about the origin, as it acts about the point (x, y): that point of a turn stays where it is */
export function aboutPoint(matrix: TransformMatrix, x: number, y: number): TransformMatrix {
	return multiply([1, 0, 0, 1, x, y], multiply(matrix, [1, 0, 0, 1, -x, -y]));
}

/** a vertical-rl box laid out as horizontal text: its content turns a quarter clockwise into the box's width and height */
export function orientMatrix(box: Pick<DocRect, 'width'>): TransformMatrix {
	return [0, 1, -1, 0, box.width, 0];
}

/** a vertical-rl box whose parent flows horizontally is a turned frame, and its descendants write inside it */
export function turnsContent(style: LayoutStyle, parent: LayoutStyle | null): boolean {
	return style.writingMode === 'vertical-rl' && (parent?.writingMode ?? 'horizontal-tb') !== 'vertical-rl';
}

/** the rotation and scale to paint the box's own frame with, about its origin point (a translate is in the box's place:
 *  placePositioned moves an absolute box by it), or null when it has neither */
export function transformMatrixOf(style: ComputedStyle, box: Pick<DocRect, 'width' | 'height'>): TransformMatrix | null {
	const transform = style.layout.transform;
	if (!transform) return null;
	const { rotate, scale, origin } = transform;
	if (rotate === 0 && scale.x === 1 && scale.y === 1) return null;
	const radians = (rotate * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const ox = origin.x.px + (origin.x.percent / 100) * box.width;
	const oy = origin.y.px + (origin.y.percent / 100) * box.height;
	return aboutPoint([cos * scale.x, sin * scale.x, -sin * scale.y, cos * scale.y, 0, 0], ox, oy);
}
