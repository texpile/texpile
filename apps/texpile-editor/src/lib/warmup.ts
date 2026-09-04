// The editor's heavy chunks (MathLive, the CodeMirror languages, the Typst parser and its wasm)
// are dynamic imports, so the first file open pays for reading and compiling them. On a first
// launch after an install that is a cold read with no code cache behind it. Pull them in while
// the start screen sits idle instead, so by the time a file is clicked they are already parsed
// and cached. Module loading is idempotent, so a click that beats the warm-up loses nothing.

const IDLE_DELAY_MS = 1500;

let started = false;

export function warmEditor(): void {
	if (started) return;
	started = true;
	async function run() {
		// one at a time: a burst of parallel compiles is exactly the freeze this avoids
		for (const load of [
			() => import('$lib/editor/visual/extensions/mathlivebridge/mlplugin'),
			() => import('$lib/languages/latex/source/latexLanguage'),
			() => import('$lib/languages/typst/visual/roundtrip'),
			() => import('$lib/languages/typst/source/typstLanguage')
		]) {
			try {
				await load();
			} catch {
				/* a chunk that fails here fails the same way on open; nothing to report */
			}
		}
	}
	const idle =
		typeof requestIdleCallback === 'function'
			? (cb: () => void) => requestIdleCallback(cb, { timeout: 4000 })
			: (cb: () => void) => setTimeout(cb, 0);
	setTimeout(() => idle(() => void run()), IDLE_DELAY_MS);
}
