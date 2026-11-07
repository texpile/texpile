// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { installForCompileLog, missingPackageFile } from '../../../../../../src/lib/modals/window/toolchain/texLivePackages';

it("reads the package file a compile lacks and leaves the writer's own .tex alone", () => {
	expect(missingPackageFile("(./main.tex\n! LaTeX Error: File `chemfig.sty' not found.\n")).toBe('chemfig.sty');
	expect(missingPackageFile("! LaTeX Error: File `chapter2.tex' not found.\n")).toBeNull();
});

it('installs a package once, so a package still missing after its install does not rerun the compile again', async () => {
	const asked: string[] = [];
	window.texpileTexLive = {
		inUse: async () => true,
		installFor: async (file: string) => {
			asked.push(file);
			return { ok: true, package: 'tabularray' };
		}
	} as unknown as TexpileTexLiveBridge;
	const log = "! LaTeX Error: File `tabularray.sty' not found.\n";
	expect(await installForCompileLog(log, '/folder')).toBe(true);
	expect(await installForCompileLog(log, '/folder')).toBe(false);
	expect(asked).toEqual(['tabularray.sty']);
});

it('leaves a TeX the writer installed alone', async () => {
	const asked: string[] = [];
	window.texpileTexLive = {
		inUse: async () => false,
		installFor: async (file: string) => {
			asked.push(file);
			return { ok: false, reason: 'not-managed', detail: file };
		}
	} as unknown as TexpileTexLiveBridge;
	expect(await installForCompileLog("! LaTeX Error: File `chemfig.sty' not found.\n", '/folder')).toBe(false);
	expect(asked).toEqual([]);
});
