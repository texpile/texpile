import { describe, it, expect } from 'vitest';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { PLAIN_TEXT_COMMANDS } from '$lib/languages/latex/parser/convert/plainTextCommands';
import { labelKey } from '$lib/languages/latex/serializer/itemLabels';

function rt(src: string): { shown: string; out: string } {
	const { doc } = latexToProseMirror(src, {});
	return {
		shown: doc.textContent,
		out: serializeToLatex(doc)
			.replace(/\s*\\par\s*$/, '')
			.trim()
	};
}

describe('the kernel ligatures', () => {
	it('read !` and ?` as the inverted marks and write them back', () => {
		expect(rt('Hola!` y ?`que')).toEqual({ shown: 'Hola¡ y ¿que', out: 'Hola!` y ?`que' });
	});

	it('fold a label written as source and as the editor holds it to one key', () => {
		expect(labelKey("``Q'' --- !`a")).toBe(labelKey('“Q” — ¡a'));
	});
});

describe('the characters commands become in text', () => {
	it('come from what the command prints', () => {
		expect(PLAIN_TEXT_COMMANDS).toMatchObject({ '%': '%', textbackslash: '\\', textasciitilde: '~', ldots: '…', textemdash: '—' });
		expect(rt('a\\ldots{} \\textless{}\\textbar{}\\%').shown).toBe('a… <|%');
	});
});
