// a MathLayout drawn at a pixel size: glyph runs in the KaTeX fonts, rules on device pixels, stretchy pieces as paths
import type { MathColor, MathLayout, MathPaintItem, MathRect } from '../contracts/sessionTypes';
import type { MathRadius } from 'mathlive';
import { devicePixelsOf, snapRect, type DevicePixels } from '../paint/devicePixels';

export type MathRole = Extract<MathColor, { role: string }>['role'];

export type MathInk = {
	/** CSS px per em */
	readonly size: number;
	/** the formula's text color */
	readonly color: string;
	/** the font family a run without its own is drawn in */
	readonly family: string;
	/** a role color in the app's mode (D23) */
	role(role: MathRole): string;
};

const paths = new Map<string, Path2D>();

function pathOf(d: string): Path2D {
	let path = paths.get(d);
	if (!path) paths.set(d, (path = new Path2D(d)));
	return path;
}

function colorOf(color: MathColor | undefined, ink: MathInk): string {
	if (!color || color === 'current') return ink.color;
	return 'css' in color ? color.css : ink.role(color.role);
}

// MathLive's dotted underline below an unknown command (.ML__error): 3 px dots along the box's bottom
const ERROR_DOTS = 'hsl(341, 100%, 40%)';

function isErrorFill(color: MathColor | undefined): boolean {
	return typeof color === 'object' && 'role' in color && color.role === 'error';
}

function drawErrorDots(ctx: CanvasRenderingContext2D, rect: MathRect): void {
	const y = rect.y + rect.height - 1.5;
	ctx.beginPath();
	for (let x = rect.x + 1.5; x < rect.x + rect.width; x += 3) {
		ctx.moveTo(x + 1, y);
		ctx.arc(x, y, 1, 0, 2 * Math.PI);
	}
	ctx.fill();
}

// a scrolled frame paints every glyph run of every formula on screen: the font strings are made once
const fonts = new Map<string, string>();
const KEPT_FONTS = 4096;

/** the run's font with its em size in px and an inherited family named */
function fontOf(font: string, ink: MathInk): string {
	const key = `${ink.size}|${ink.family}|${font}`;
	let css = fonts.get(key);
	if (css === undefined) {
		if (fonts.size >= KEPT_FONTS) fonts.clear();
		css = font.replace(/(-?\d*\.?\d+)em/, (_, em: string) => `${Number(em) * ink.size}px`).replace(/ inherit$/, ` ${ink.family}`);
		fonts.set(key, css);
	}
	return css;
}

function scaled(rect: MathRect, x: number, baseline: number, size: number): MathRect {
	return { x: x + rect.x * size, y: baseline + rect.y * size, width: rect.width * size, height: rect.height * size };
}

/** fits a path's viewBox into its box as SVG's preserveAspectRatio does, clipped to the box */
function drawPath(ctx: CanvasRenderingContext2D, item: Extract<MathPaintItem, { kind: 'path' }>, box: MathRect, ink: MathInk): void {
	const [vx, vy, vw, vh] = item.viewBox;
	const [align, mode] = item.aspect.split(' ');
	let sx = box.width / vw;
	let sy = box.height / vh;
	let dx = 0;
	if (align !== 'none') {
		sx = sy = mode === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
		const spare = box.width - vw * sx;
		dx = align.startsWith('xMid') ? spare / 2 : align.startsWith('xMax') ? spare : 0;
	}
	ctx.save();
	ctx.beginPath();
	ctx.rect(box.x, box.y, box.width, box.height);
	ctx.clip();
	ctx.translate(box.x + dx - vx * sx, box.y - vy * sy);
	ctx.scale(sx, sy);
	if (item.fill !== undefined || item.stroke === undefined) {
		Object.assign(ctx, { fillStyle: colorOf(item.fill, ink) });
		ctx.fill(pathOf(item.d));
	}
	if (item.stroke !== undefined) {
		Object.assign(ctx, { strokeStyle: colorOf(item.stroke, ink), lineWidth: item.strokeWidth ?? 1, lineCap: 'round' });
		ctx.setLineDash(item.dash ?? []);
		ctx.stroke(pathOf(item.d));
	}
	ctx.restore();
}

function roundRectPath(ctx: CanvasRenderingContext2D, rect: MathRect, radius: [number, number]): void {
	const [rx, ry] = radius;
	ctx.roundRect(rect.x, rect.y, rect.width, rect.height, [{ x: Math.max(0, rx), y: Math.max(0, ry) }]);
}

function radiusPx(radius: MathRadius, size: number): [number, number] {
	return typeof radius === 'number' ? [radius * size, radius * size] : [radius[0] * size, radius[1] * size];
}

function drawFrame(
	ctx: CanvasRenderingContext2D,
	item: Extract<MathPaintItem, { kind: 'frame' }>,
	rect: MathRect,
	ink: MathInk,
	px: DevicePixels
): void {
	const [top, right, bottom, left] = item.widths.map((w) => w * ink.size);
	Object.assign(ctx, { fillStyle: colorOf(item.color, ink) });
	if (item.radius) {
		const [rx, ry] = radiusPx(item.radius, ink.size);
		const inner = { x: rect.x + left, y: rect.y + top, width: rect.width - left - right, height: rect.height - top - bottom };
		ctx.beginPath();
		roundRectPath(ctx, rect, [rx, ry]);
		roundRectPath(ctx, inner, [rx - left, ry - top]);
		ctx.fill('evenodd');
		return;
	}
	const sides: MathRect[] = [
		{ x: rect.x, y: rect.y, width: rect.width, height: top },
		{ x: rect.x + rect.width - right, y: rect.y, width: right, height: rect.height },
		{ x: rect.x, y: rect.y + rect.height - bottom, width: rect.width, height: bottom },
		{ x: rect.x, y: rect.y, width: left, height: rect.height }
	];
	for (const side of sides) {
		if (side.width <= 0 || side.height <= 0) continue;
		const snapped = snapRect(side, px);
		ctx.fillRect(snapped.x, snapped.y, snapped.width, snapped.height);
	}
}

type GlyphRun = Extract<MathPaintItem, { kind: 'glyphs' }>;

function sameInk(one: GlyphRun, two: GlyphRun): boolean {
	const [a, b] = [one.color, two.color];
	const sameColor = a === b || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));
	return sameColor && one.opacity === two.opacity;
}

const orders = new WeakMap<MathLayout, readonly MathPaintItem[]>();

/** glyph runs of one color between other items grouped by font: fills of one color commute, and a font set costs a parse */
function paintOrder(layout: MathLayout): readonly MathPaintItem[] {
	let order = orders.get(layout);
	if (order) return order;
	const items: MathPaintItem[] = [];
	let run: GlyphRun[] = [];
	function flush(): void {
		items.push(...run.sort((a, b) => (a.font < b.font ? -1 : a.font > b.font ? 1 : 0)));
		run = [];
	}
	for (const item of layout.items) {
		if (item.kind === 'glyphs' && (!run.length || sameInk(run[0], item))) {
			run.push(item);
			continue;
		}
		flush();
		if (item.kind === 'glyphs') run.push(item);
		else items.push(item);
	}
	flush();
	orders.set(layout, (order = items));
	return order;
}

/** the context's font and fill, set only when a run asks for another: setting either costs a parse */
class MathPen {
	private font = '';
	private fill = '';

	constructor(private readonly ctx: CanvasRenderingContext2D) {}

	use(font: string | null, fill: string): void {
		if (font !== null && font !== this.font) Object.assign(this.ctx, { font: (this.font = font) });
		if (fill !== this.fill) Object.assign(this.ctx, { fillStyle: (this.fill = fill) });
	}

	/** a path drawn under save and restore leaves the fill as it found it */
	forget(): void {
		this.fill = '';
	}
}

/** draws the layout with its left edge at x and its baseline at baseline, in the context's units */
export function paintMathLayout(ctx: CanvasRenderingContext2D, layout: MathLayout, x: number, baseline: number, ink: MathInk): void {
	const px = devicePixelsOf(ctx);
	const alpha = ctx.globalAlpha;
	const pen = new MathPen(ctx);
	Object.assign(ctx, { textBaseline: 'alphabetic', textAlign: 'left' });
	for (const item of paintOrder(layout)) {
		switch (item.kind) {
			case 'glyphs':
				if (item.opacity <= 0) break;
				pen.use(fontOf(item.font, ink), colorOf(item.color, ink));
				if (item.opacity < 1) Object.assign(ctx, { globalAlpha: alpha * item.opacity });
				ctx.fillText(item.text, x + item.x * ink.size, baseline + item.y * ink.size);
				if (item.opacity < 1) Object.assign(ctx, { globalAlpha: alpha });
				break;
			case 'rule': {
				const rule = snapRect(scaled({ x: item.x, y: item.y, width: item.w, height: item.h }, x, baseline, ink.size), px);
				pen.use(null, colorOf(item.color, ink));
				ctx.fillRect(rule.x, rule.y, rule.width, rule.height);
				break;
			}
			case 'fill': {
				const rect = scaled(item.rect, x, baseline, ink.size);
				pen.use(null, colorOf(item.color, ink));
				ctx.beginPath();
				if (item.radius) roundRectPath(ctx, rect, radiusPx(item.radius, ink.size));
				else ctx.rect(rect.x, rect.y, rect.width, rect.height);
				ctx.fill();
				if (isErrorFill(item.color)) {
					pen.use(null, ERROR_DOTS);
					drawErrorDots(ctx, rect);
				}
				break;
			}
			case 'frame':
				drawFrame(ctx, item, scaled(item.rect, x, baseline, ink.size), ink, px);
				pen.forget();
				break;
			case 'path':
				drawPath(ctx, item, scaled(item.box, x, baseline, ink.size), ink);
				pen.forget();
				break;
		}
	}
}
