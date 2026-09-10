// Shared by the local preview pane and the guest's remote one, which theme the same page.

/**
 * The app's own colour for `name`, resolved to a concrete rgb() or rgba() - NOT the raw declaration.
 *
 * The raw value is oklch(...) in this theme, and the colour crosses an IPC boundary whose
 * sanitizer (cssColour in electron main) passes only a colour-shaped charset. A computed style
 * keeps whatever syntax the token used (oklch stays oklch, a color-mix comes back as color(srgb)),
 * and xterm's theme parser takes neither, so the probe's colour is painted on a 1px canvas and
 * read back as plain 8-bit channels, which survives every hop.
 */
export function themeColour(name: string, fallback: string): string {
	if (typeof document === 'undefined') return fallback;
	if (!getComputedStyle(document.documentElement).getPropertyValue(name).trim()) return fallback;
	const probe = document.createElement('div');
	probe.style.color = `var(${name})`;
	document.documentElement.appendChild(probe);
	const v = getComputedStyle(probe).color;
	probe.remove();
	return (v && toRgb(v)) || fallback;
}

function toRgb(css: string): string | null {
	const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;
	ctx.fillStyle = css;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
	return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
}
