// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { toolchainProbe } from '../../../../src/lib/modals/window/toolchainProbe.svelte';

it('fills in each row as its probe answers instead of waiting for the slowest', async () => {
	let emit: ((p: ToolProbe) => void) | undefined;
	let finish!: (tools: ToolProbe[]) => void;
	const fast: ToolProbe = { id: 'bibtex', found: true, detail: 'BibTeX 0.99d', command: 'bibtex' };
	const slow: ToolProbe = { id: 'biber', found: true, detail: 'biber version: 2.21', command: 'biber' };
	window.texpileTypst = {
		probeToolchain: () => new Promise<ToolProbe[]>((r) => (finish = r)),
		onProbeResult: (cb: (p: ToolProbe) => void) => {
			emit = cb;
			return () => (emit = undefined);
		},
		resolve: async () => null,
		distros: async () => []
	} as unknown as TexpileTypstBridge;
	const run = toolchainProbe.run();
	emit!(fast);
	expect(toolchainProbe.probing).toBe(true);
	// one row in is not the answer: the missing-program dialog waits for the whole of it
	expect(toolchainProbe.checked).toBe(false);
	expect(toolchainProbe.answered).toContain('bibtex');
	expect(toolchainProbe.probeFor('bibtex')?.detail).toBe('BibTeX 0.99d');
	expect(toolchainProbe.probeFor('biber')).toBeUndefined();
	emit!(slow);
	finish([fast, slow]);
	await run;
	expect(toolchainProbe.probing).toBe(false);
	expect(toolchainProbe.checked).toBe(true);
	expect(emit).toBeUndefined();
	expect(toolchainProbe.probes.map((p) => p.id).sort()).toEqual(['biber', 'bibtex']);
});
