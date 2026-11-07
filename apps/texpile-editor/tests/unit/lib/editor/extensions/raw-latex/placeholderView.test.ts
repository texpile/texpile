import { describe, it, expect } from 'vitest';
import { placeholderCommand } from '$lib/editor/visual/extensions/raw-latex/placeholderView';

describe('placeholderCommand (hidden structural commands)', () => {
	it('recognises \\maketitle and friends (with surrounding whitespace)', () => {
		expect(placeholderCommand('\\maketitle')).toEqual({ command: 'maketitle', label: 'Title block' });
		expect(placeholderCommand('  \\maketitle\n')).toEqual({ command: 'maketitle', label: 'Title block' });
		expect(placeholderCommand('\\tableofcontents')?.command).toBe('tableofcontents');
		// LyX follows a command with {} to keep the space after it
		expect(placeholderCommand('\\tableofcontents{}')?.command).toBe('tableofcontents');
	});

	it('recognises \\printbibliography, plain and with [options]', () => {
		expect(placeholderCommand('\\printbibliography')).toEqual({ command: 'printbibliography', label: 'Bibliography' });
		expect(placeholderCommand('\\printbibliography[title={Works Cited}]')).toEqual({ command: 'printbibliography', label: 'Bibliography' });
		expect(placeholderCommand('  \\printbibliography[heading=bibintoc]\n')?.command).toBe('printbibliography');
	});

	it('does not match similar names, args, or frontmatter', () => {
		expect(placeholderCommand('\\maketitlepage')).toBeNull();
		expect(placeholderCommand('\\section{X}')).toBeNull();
		expect(placeholderCommand('\\title{X}')).toBeNull();
		expect(placeholderCommand('\\maketitle and text')).toBeNull();
	});
});
