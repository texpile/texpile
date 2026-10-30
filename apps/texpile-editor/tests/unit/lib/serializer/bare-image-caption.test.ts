// a standalone \includegraphics round-trips bare; a caption typed in the editor was then dropped
import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

describe('bare \\includegraphics', () => {
	it('stays bare without a caption', () => {
		const out = serializeToLatex(treeToProseMirror('\\includegraphics{a.png}').doc);
		expect(out.trim()).toBe('\\includegraphics{a.png}');
	});

	it('gets a figure once a caption is typed', () => {
		const doc = treeToProseMirror('\\includegraphics{a.png}').doc;
		let image: typeof doc | null = null;
		doc.descendants((n) => {
			if (n.type.name === 'image') image = n;
		});
		expect(image).not.toBeNull();
		// the parser builds unchecked (NodeType.create); mirror that, since a captioned image is
		// what the editor produces in place
		const captioned = image!.type.create({ ...image!.attrs, showCaption: true }, [schema.text('A caption')], image!.marks);
		const rebuilt = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [captioned])]);
		const out = serializeToLatex(rebuilt);
		expect(out).toContain('\\caption{A caption}');
		expect(out).toContain('\\begin{figure}');
	});
});
