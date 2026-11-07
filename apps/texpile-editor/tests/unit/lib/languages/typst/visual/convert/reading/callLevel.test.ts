import { afterEach, expect, it } from 'vitest';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';

afterEach(() => {
	typstScopeNow.current = null;
});

it('a package call that hands its body on through ..args holds that body as a box, as Insert offers it', async () => {
	const file = '#import "@preview/gentle-clues:1.3.1": *\n\n#info[A clue.]\n\n#info[]\n';
	typstScopeNow.current = await scopeOfFile(file, null, { path: 'main.typ', main: null, read: async () => null });
	const kinds: string[] = [];
	typstToProseMirror(file).doc.forEach((n) => kinds.push(n.type.name === 'typ_env' ? `typ_env ${n.attrs.name}` : n.type.name));
	expect(kinds.slice(1)).toEqual(['typ_env info', 'typ_env info']);
});
