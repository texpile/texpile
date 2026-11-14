// Plausible for the marketing site only; the offline editor app never loads this

import { browser } from '$app/env';
import type { track as Track } from '@plausible-analytics/tracker';

let initialized = false;
let trackFn: typeof Track | null = null;

/** loads and starts Plausible in the browser. Safe to call more than once. */
export async function initAnalytics() {
	if (!browser || initialized) return;
	initialized = true;

	try {
		const { init, track, DEFAULT_FILE_TYPES } = await import('@plausible-analytics/tracker');
		trackFn = track;
		init({
			domain: 'texpile.com',
			// endpoint defaults to https://plausible.io/api/event (Plausible Cloud)
			outboundLinks: true,
			// Plausible checks outbound-links before file-downloads and returns on the first match,
			// so a cross-host installer click (R2) logs as "Outbound Link: Click", never "File Download".
			// The extended list (defaults omit .AppImage/.deb, case-sensitive) only hits same-origin links.
			fileDownloads: { fileExtensions: [...DEFAULT_FILE_TYPES, 'AppImage', 'deb'] }
		});
	} catch (e) {
		console.warn('Failed to initialize Plausible:', e);
	}
}

/** fires a custom Plausible event; no-op until initAnalytics() has run. This plan has no custom
 *  properties, so callers encode any breakdown in the event name itself. */
export function trackEvent(name: string) {
	if (!browser || !trackFn) return;
	trackFn(name, {});
}
