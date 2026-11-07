// @vitest-environment jsdom
// a block-level package call given content, drawn as that content
import { it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

it('draws the content alone when the call only passes it on, else under the name of the function', async () => {
	typstScopeNow.current = await scopeOfFile(
		'#import "@preview/js:0.1.4": noindent\n#import "@preview/precis-upb-cs:0.1.0": synopsis\n',
		null
	);
	const passed = typstFace('#noindent[Plain words.]');
	expect(passed?.dom.textContent).toBe('Plain words.');
	expect(passed?.dom.querySelector('.env-label')).toBeNull();
	expect(typstFace('#synopsis[Short words.]')?.dom.querySelector('.env-label')?.textContent).toBe('synopsis');
});
