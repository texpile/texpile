// The missing-image state, drawn in place of the old bundled PNG. That raster carried baked-in
// English ("please delete it and upload a new file" - another app's advice), could not be
// localized, and never said WHICH file is missing. Same flat empty-state card as the
// remote-image-blocked svg in imageplugin: vector, muted grays that read on either theme, with
// lucide's image-off glyph so it matches the app's icon set.
import { m } from '$lib/paraglide/messages';

// 480 wide read as a banner across the figure rather than a stand-in for the missing picture.
// The height is unchanged: it is the width that was out of proportion.
const W = 320;
const H = 120;
const MID = W / 2;
// the lucide glyph is 24 units at scale 1.5, so half of it is 18
const GLYPH_X = MID - 18;

const IMAGE_OFF_GLYPH =
	`<g transform="translate(${GLYPH_X},14) scale(1.5)" stroke="#8a8a8a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
	'<line x1="2" x2="22" y1="2" y2="22"/>' +
	'<path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/>' +
	'<line x1="13.5" x2="6" y1="13.5" y2="21"/>' +
	'<line x1="18" x2="21" y1="12" y2="15"/>' +
	'<path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"/>' +
	'<path d="M21 15V5a2 2 0 0 0-2-2H9"/>' +
	'</g>';

function xmlEscape(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** keeps the start and the tail (where the filename lives) of an over-long path.
 *  40 rather than 46, because the card is narrower now: the face measures 6.6px a character at
 *  12px, so 43 is what fits between 16px margins and 40 leaves the margins honest. */
function middleTruncate(s: string, max = 40): string {
	return s.length <= max ? s : `${s.slice(0, Math.ceil((max - 1) / 2))}…${s.slice(-Math.floor((max - 1) / 2))}`;
}

/** an <img>-ready card naming the file that could not be found. */
export function missingImageSvg(path: string): string {
	return (
		'data:image/svg+xml;utf8,' +
		encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
				`<rect width="${W}" height="${H}" fill="#80808018" rx="8"/>` +
				IMAGE_OFF_GLYPH +
				`<text x="${MID}" y="76" text-anchor="middle" font-family="system-ui" font-size="14" fill="#8a8a8a">${xmlEscape(m.image_missing_label())}</text>` +
				`<text x="${MID}" y="98" text-anchor="middle" font-family="ui-monospace, Consolas, monospace" font-size="12" fill="#8a8a8a">${xmlEscape(middleTruncate(path))}</text>` +
				'</svg>'
		)
	);
}
