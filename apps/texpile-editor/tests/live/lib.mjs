// Classification helpers for the live matrix (browser-harness edition): events come from
// window.__draftEvents via __live.events(), stamped with performance.now() at emit.
// PROV is gone: an unproven render is no longer painted, so every render on screen is an
// EXACT one and everything else recompiles. A row still grading PROV means a provisional
// paint path survived the removal, so the outcome is kept and will show up as `other`.
const OUTCOME = {
	patched: 'EXACT',
	'patched-chain': 'EXACT',
	'patched-pull': 'EXACT',
	'patched-split': 'EXACT',
	provisional: 'LEAK',
	'provisional-split': 'LEAK',
	'provisional-insert': 'LEAK',
	'provisional-delete': 'LEAK',
	abandon: 'RECOMPILE',
	'transient-hold': 'TRANSIENT',
	error: 'ERROR'
};
const VISUAL = new Set(['patched', 'patched-chain', 'patched-pull', 'patched-split']);

/** Classify one edit burst: last outcome wins; latency = first event -> first visual outcome. */
export function classify(events) {
	let outcome = null;
	for (const e of events) if (OUTCOME[e.kind]) outcome = OUTCOME[e.kind];
	if (!outcome) outcome = events.some((e) => e.kind === 'compile-start') ? 'RECOMPILE' : 'NOFEEDBACK';
	const first = events[0];
	const visual = events.find((e) => VISUAL.has(e.kind));
	const compiled = [...events].reverse().find((e) => e.kind === 'compiled');
	let latencyMs = null;
	if (first && visual) latencyMs = Math.round(visual.t - first.t);
	else if (first && compiled) latencyMs = Math.round(compiled.t - first.t);
	const reasons = events
		.filter((e) =>
			[
				'abandon',
				'provisional',
				'bail',
				'locate-bail',
				'locate-source-bail',
				'locate-split-bail',
				'chain-end',
				'patch-verify',
				'skel-refused',
				'hop-refused',
				'hop-skel-b',
				'skel-shrunk',
				'skel-break-moved',
				'skel-certified',
				'locate-glyph-bail',
				'locate-xpage-bail',
				'locate-inverse-bail',
				'locate-inverse-span',
				'locate-inverse-ok',
				'compile-start',
				// the incremental record store disagreeing with the engine's own. Invisible in
				// the UI -- it costs a later LOCATE, not this render -- so the sweep must carry it
				'records-adopted-drift'
			].includes(e.kind)
		)
		.map(
			(e) =>
				(e.kind === 'patch-verify' ? 'verify:' + e.detail?.verdict + (e.detail?.drift ? '/drift' + e.detail.drift : '') : null) ||
				(e.kind === 'records-adopted-drift'
					? `RECORDS-DRIFT/p${e.detail?.page}/dy${e.detail?.maxDy}/rows${e.detail?.rows}v${e.detail?.freshRows}`
					: null) ||
				(e.kind.startsWith('skel-') ? (e.detail?.why ?? e.kind) : null) ||
				e.detail?.reason ||
				e.detail?.stage ||
				(e.detail?.why ? e.detail.why + (e.detail.err ? '=' + String(e.detail.err).slice(0, 80) : '') : null) ||
				(typeof e.detail === 'string' ? e.detail : null)
		)
		.filter(Boolean);
	return { outcome, latencyMs, reasons: [...new Set(reasons)].slice(0, 6) };
}

/** Drain page events until quiet (and no compile left in flight). */
export async function collectUntilQuiet(page, { quietMs = 900, maxMs = 12000 } = {}) {
	const all = [];
	let lastNew = Date.now();
	const t0 = Date.now();
	for (;;) {
		const batch = await page.evaluate(() => window.__live.events());
		if (batch.length) {
			all.push(...batch);
			lastNew = Date.now();
		} else if (Date.now() - lastNew > quietMs) {
			const pending = all.filter((e) => e.kind === 'compile-start').length > all.filter((e) => e.kind === 'compiled').length;
			if (!pending || Date.now() - t0 > maxMs) break;
		}
		if (Date.now() - t0 > maxMs) break;
		await new Promise((r) => setTimeout(r, 120));
	}
	return all;
}
