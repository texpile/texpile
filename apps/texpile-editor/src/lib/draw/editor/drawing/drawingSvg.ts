import type { Drawing } from './drawing.types';
import type { LoadedFont } from './fontOutlines';

type Outline = (font: LoadedFont, code: number, gi?: number) => string | null;

function attr(name: string, value: string | number | null | undefined) {
	return value === null || value === undefined ? '' : ` ${name}="${value}"`;
}

/** the drawing as a standalone svg document in bp, the picture's box as its viewBox; an image without a URL is its box */
export function drawingToSvg(drawing: Drawing, fonts: Map<number, LoadedFont>, outline: Outline, imageUrl?: (path: string) => string) {
	const { x, y, w, h } = drawing.bbox;
	function clip(id: string | null) {
		return id ? `url(#${id})` : null;
	}
	// a clip is in the picture's space: on an element with a matrix of its own, the matrix would move it too
	function clipped(id: string | null, element: string) {
		return id ? `<g clip-path="url(#${id})">${element}</g>` : element;
	}
	function blended(blend: string | undefined) {
		return blend ? ` style="mix-blend-mode:${blend}"` : '';
	}
	function stops(g: Drawing['gradients'][number]) {
		return g.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
	}
	const gradients = drawing.gradients
		.map((g) =>
			g.kind === 'hatch'
				? `<pattern id="${g.id}" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(-45)"><rect width="0.8" height="4" fill="${g.stops[0].color}"/></pattern>`
				: g.kind === 'linear'
					? `<linearGradient id="${g.id}" gradientUnits="userSpaceOnUse" x1="${g.from[0]}" y1="${g.from[1]}" x2="${g.to[0]}" y2="${g.to[1]}" gradientTransform="matrix(${g.transform.join(' ')})">${stops(g)}</linearGradient>`
					: `<radialGradient id="${g.id}" gradientUnits="userSpaceOnUse" cx="${g.from[0]}" cy="${g.from[1]}" r="${g.radius}" fx="${g.focus[0]}" fy="${g.focus[1]}" gradientTransform="matrix(${g.transform.join(' ')})">${stops(g)}</radialGradient>`
		)
		.join('');
	const defs =
		gradients +
		drawing.clips
			.map(
				(c) =>
					`<clipPath id="${c.id}"${attr('clip-path', clip(c.parent))}><path d="${c.d}"${attr('clip-rule', c.evenOdd ? 'evenodd' : null)}/></clipPath>`
			)
			.join('');
	const body = drawing.parts
		.map((p) => {
			if (p.kind === 'image') {
				const place = `transform="matrix(${p.matrix.join(' ')})"${attr('opacity', p.opacity < 1 ? p.opacity : null)}${blended(p.blend)}`;
				const url = p.path.startsWith('data:') ? p.path : imageUrl?.(p.path);
				return clipped(
					p.clip,
					url
						? `<image href="${url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" width="1" height="1" preserveAspectRatio="none" ${place}/>`
						: `<rect width="1" height="1" fill="rgb(232 235 237)" ${place}/>`
				);
			}
			if (p.kind === 'glyph') {
				const font = fonts.get(p.font);
				const d = font ? outline(font, p.code, p.gi) : null;
				return d
					? clipped(
							p.clip,
							`<path d="${d}" transform="matrix(${p.matrix.join(' ')})"${attr('fill', p.fill)}${attr('fill-opacity', p.opacity < 1 ? p.opacity : null)}${blended(p.blend)}/>`
						)
					: '';
			}
			return (
				`<path d="${p.d}"${blended(p.blend)}${attr('fill', p.gradient ? `url(#${p.gradient})` : (p.fill ?? 'none'))}${attr('fill-opacity', p.fillOpacity < 1 ? p.fillOpacity : null)}${attr('fill-rule', p.evenOdd ? 'evenodd' : null)}` +
				`${attr('stroke', p.stroke)}${attr('stroke-width', p.stroke ? p.strokeWidth : null)}${attr('stroke-opacity', p.strokeOpacity < 1 ? p.strokeOpacity : null)}` +
				`${attr('stroke-dasharray', p.dash)}${attr('stroke-dashoffset', p.dashOffset || null)}${attr('stroke-linecap', p.stroke ? p.cap : null)}${attr('stroke-linejoin', p.stroke ? p.join : null)}${attr('clip-path', clip(p.clip))}/>`
			);
		})
		.join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}pt" height="${h}pt" viewBox="${x} ${-(y + h)} ${w} ${h}"><defs>${defs}</defs><g transform="scale(1 -1)" style="isolation:isolate">${body}</g></svg>`;
}
