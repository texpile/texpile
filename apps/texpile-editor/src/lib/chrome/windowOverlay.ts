// Keeps Chromium's window-controls overlay looking like part of our title bar.
//
// Off macOS the window is frameless and minimise / maximise / close are drawn by Chromium into a
// reserved strip at the end of the bar (main.ts sets titleBarOverlay). That strip is outside the
// page, so it inherits nothing: its background, its symbol colour and its height all have to be
// pushed across, or the buttons sit in a white box on a dark title bar.
//
// Colours are read off the live element rather than named, so a theme change - or a new theme -
// carries without anyone remembering this file exists.

import { settings } from '$lib/settings';
import { themeEpoch } from '$lib/theme';
import { observe } from '$lib/runes/observe.svelte';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { isMac } from '$lib/platform';

type OverlayApi = {
	windowSetOverlay?: (o: { height?: number; color?: string; symbolColor?: string; background?: string }) => void;
	onWindowState?: (cb: (s: { maximized: boolean; fullScreen: boolean }) => void) => () => void;
};

let probe: CanvasRenderingContext2D | null = null;

/**
 * A CSS colour as `#rrggbb`, whatever notation it arrived in.
 *
 * Necessary because our theme is OKLCH (`--color-surface-100: oklch(91.74% 0.01 247.84deg)`) and
 * getComputedStyle hands Color 4 values back unchanged rather than downsampling them to rgb(). The
 * overlay is painted by Chromium's native layer, whose colour parser does not take oklch, so it
 * silently keeps whatever it had - which is how the buttons ended up in a white box on a dark bar.
 *
 * Painting a pixel and reading it back is the conversion, rather than a parser of our own: the
 * browser already knows every colour syntax it accepts, and the canvas gives plain sRGB bytes.
 */
function toHex(...layers: string[]): string | undefined {
	probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	if (!probe) return undefined;
	probe.clearRect(0, 0, 1, 1);
	// Painted in order, WITHOUT clearing between: canvas composites source-over by default, so a
	// translucent layer here blends exactly the way the same colour blends over the same backdrop in
	// the page. That is how a modal scrim gets matched - the arithmetic is the browser's, and the
	// scrim's opacity stays defined in exactly one place, its own stylesheet.
	for (const css of layers) {
		probe.fillStyle = css;
		probe.fillRect(0, 0, 1, 1);
	}
	const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
	// a transparent title bar has no colour to hand over; leaving it unset keeps the system default,
	// which beats painting the strip black
	if (a === 0) return undefined;
	return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The class every modal backdrop carries, so this file can find one without knowing which dialog
 * raised it. It has to be on the backdrop's OWN element - the observer below checks added nodes
 * only, not their descendants, which is what keeps it off CodeMirror's hot path.
 */
const SCRIM = 'app-scrim';

/**
 * The backdrop colours currently stacked over the page, outermost first.
 *
 * Read from the live elements rather than named, for the same reason the theme colours are: the
 * opacity belongs to the stylesheet. Every scrim is returned, not just the first - Preferences can
 * raise the MCP setup dialog on top of itself, and two backdrops darken twice.
 */
function scrimLayers(): string[] {
	return [...document.querySelectorAll<HTMLElement>(`.${SCRIM}`)].map((e) => getComputedStyle(e).backgroundColor);
}

/**
 * Report `el`'s height and colours to the overlay, and keep reporting as they change.
 *
 * Returns a teardown. A no-op on macOS and in the browser build, where there is no overlay.
 */
export function syncWindowOverlay(el: HTMLElement): () => void {
	const api = nativeBridge() as OverlayApi | undefined;
	if (isMac || !api?.windowSetOverlay) return () => {};

	// last values sent: the observers below fire on plenty of changes that move neither, and an IPC
	// message per mouse-driven reflow is waste
	let sent: { height: number; color?: string; symbolColor?: string; background?: string } | null = null;

	function push() {
		const cs = getComputedStyle(el);
		// The overlay is sized in DEVICE pixels and does not scale with webContents.setZoomFactor,
		// but the bar it sits in is CSS pixels and does. At zoom 1.5 a 32px bar is 48 real pixels,
		// and an overlay left at 32 would leave the buttons floating above the bar's bottom edge.
		const zoom = Number(settings.current.uiZoom) || 1;
		// Content box, NOT the border box. The bar's border-b is the divider drawn UNDER it, and an
		// overlay tall enough to include it covers that line on the right-hand side only - which does
		// not read as a 1px error, it reads as the bar being thicker at one end than the other.
		const border = parseFloat(cs.borderBottomWidth) || 0;
		const height = Math.round((el.getBoundingClientRect().height - border) * zoom);
		// A modal's backdrop is a DOM element and the overlay is not in the DOM, so no z-index reaches
		// it: with a dialog up, the buttons stay bright while the whole page behind them dims. The
		// only way to match is to repaint the strip with the same blend the scrim performs.
		//
		// BACKGROUND ONLY. VS Code dims the symbols too, and that is wrong here: minimise, maximise
		// and close keep WORKING while a modal is up, unlike everything else the scrim covers, so
		// fading the glyphs would advertise them as disabled. Dimming the strip alone puts the
		// buttons behind the same veil as the rest of the window while leaving them plainly legible.
		const color = toHex(cs.backgroundColor, ...scrimLayers());
		const symbolColor = toHex(cs.color);
		// The WINDOW's background, which is a different thing from the bar's. Chromium fills newly
		// exposed area with it during a resize, before the renderer has painted - so on maximise or
		// restore the window's initial '#ffffff' flashes across a dark theme. main cannot pick a
		// better one at creation: the theme lives in localStorage, which only this side can read.
		const background = toHex(getComputedStyle(document.body).backgroundColor);
		if (sent && sent.height === height && sent.color === color && sent.symbolColor === symbolColor && sent.background === background)
			return;
		sent = { height, color, symbolColor, background };
		api?.windowSetOverlay?.({ height, color, symbolColor, background });
	}

	push();

	// height changes with zoom and with the window; colour changes when `dark` is toggled on <html>,
	// which computed style follows but no event announces
	const ro = new ResizeObserver(push);
	ro.observe(el);
	const mo = new MutationObserver(push);
	mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-mode', 'data-theme'] });
	// uiZoom resizes nothing the observer can see: setZoomFactor scales the whole renderer, so the
	// bar's CSS height is unchanged and only the device-pixel height it maps to moves
	const unsub = observe(() => settings.current, push);
	// a preset's colours arrive when its stylesheet loads, after the data-theme flip the observer above sees
	const unsubTheme = observe(() => themeEpoch.current, push);
	// maximise / restore / full screen all change the overlay's geometry, and full screen removes it
	// entirely; re-reporting keeps the strip and the window fill correct across each of those
	const offState = api.onWindowState?.(push);
	// A scrim appearing or leaving is a plain DOM insertion that nothing announces. Watching the
	// whole body sounds expensive next to CodeMirror's per-keystroke churn, and would be if this
	// queried on every record - so it only tests whether an added or removed node itself carries
	// the class, which for a text node or a highlight span is one instanceof and no work at all.
	function hasScrim(nodes: NodeList): boolean {
		for (const n of nodes) if (n instanceof Element && n.classList.contains(SCRIM)) return true;
		return false;
	}
	const scrimMo = new MutationObserver((records) => {
		for (const r of records) {
			if (hasScrim(r.addedNodes) || hasScrim(r.removedNodes)) return push();
		}
	});
	scrimMo.observe(document.body, { childList: true, subtree: true });

	return () => {
		ro.disconnect();
		mo.disconnect();
		scrimMo.disconnect();
		unsub();
		unsubTheme();
		offState?.();
	};
}
