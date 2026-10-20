import { describe, expect, it } from 'vitest';
import { writeCrossRef } from '$lib/languages/latex/visual/extensions/drawn/settings/crossRefCommand';
import { refCommandsFor, starredRefCommands } from '$lib/languages/latex/visual/extensions/drawn/settings/refCommandsFor';
import { filePackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';

const CLASS = '\\documentclass{article}\n';
const starsOf = async (text: string) => starredRefCommands(text, await filePackages(text));

describe('crossRefCommand', () => {
	it('gives a star only to the commands the loaded files give one', async () => {
		const stars = await starsOf(`${CLASS}\\usepackage{amsmath}\\usepackage{hyperref}`);
		expect(stars).toContain('ref');
		expect(stars).not.toContain('eqref');
		expect(writeCrossRef('\\ref*{a}', { name: 'eqref', star: true, labels: 'a' }, stars)).toBe('\\eqref{a}');
		expect(writeCrossRef('\\ref*{a}', { name: 'pageref', star: true, labels: 'a' }, stars)).toBe('\\pageref*{a}');
	});

	it('keeps the star of a command that already has one', () => {
		expect(writeCrossRef('\\ref*{a}', { name: 'ref', star: true, labels: 'b' })).toBe('\\ref*{b}');
	});
});

describe('refCommandsFor', () => {
	it('leaves out a command the data hides', async () => {
		const text = '\\documentclass{memoir}\n';
		expect(refCommandsFor(text, await filePackages(text))).not.toContain('Cref');
	});
});
