import { describe, expect, it } from 'vitest';
import { packageDefining } from '$lib/languages/latex/knowledge/commands/packageFor';

describe('packageDefining', () => {
	it('gives the package named like the name, else the one most papers load when it has twice the papers of the next', () => {
		expect(packageDefining('command', 'citep')).toBe('natbib');
		expect(packageDefining('command', 'url')).toBe('url');
		expect(packageDefining('command', 'text')).toBe('amsmath');
		expect(packageDefining('command', 'cancel')).toBe('cancel');
		expect(packageDefining('command', 'hl')).toBe('soul');
	});

	it('gives the package that defines the name before one that only loads it', () => {
		expect(packageDefining('command', 'includegraphics')).toBe('graphicx');
		expect(packageDefining('command', 'mathbb')).toBe('amsfonts');
		expect(packageDefining('command', 'ifdefstring')).toBe('etoolbox');
		expect(packageDefining('command', 'setmainfont')).toBe('fontspec');
		expect(packageDefining('command', 'captionsetup')).toBe('caption');
	});

	it('leaves out a name no package clearly leads, a one-letter user macro, a siunitx unit and a name only an option defines', () => {
		for (const name of ['subfloat', 'N', 'C', 'm', 'R', 'Acs']) expect(packageDefining('command', name)).toBeUndefined();
	});

	it('reads a starred environment as its plain name and leaves a name no package defines out', () => {
		expect(packageDefining('environment', 'align*')).toBe('amsmath');
		expect(packageDefining('environment', 'siderules')).toBeUndefined();
		expect(packageDefining('command', 'constructor')).toBeUndefined();
	});
});
