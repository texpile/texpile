import { expect, it } from 'vitest';
import { fileService } from '$lib/files/service/fileService';
import { fileUriOf } from '$lib/files/identity/fileUris';
import type { FileChange } from '$lib/files/changes/fileChanges';
import { FileRevision, urlAtRevision } from '$lib/files/service/fileRevision.svelte';

// a PDF open in a tab kept showing the bytes it was opened with after a compile wrote the file again
it('gives a viewer a new url when its own file changes on disk', () => {
	let fire: (changes: FileChange[]) => void = () => {};
	const detach = fileService.use({ watch: (fn: typeof fire) => ((fire = fn), () => {}) } as never);
	const revision = new FileRevision(() => '/w/paper.pdf');
	const stop = revision.watch();
	fire([{ type: 'updated', resource: fileUriOf('/w/other.pdf') }]);
	expect(urlAtRevision('texfile://local/?path=p', revision.current)).toBe('texfile://local/?path=p');
	fire([{ type: 'updated', resource: fileUriOf('/w/paper.pdf') }]);
	expect(urlAtRevision('texfile://local/?path=p', revision.current)).toBe('texfile://local/?path=p&t=1');
	expect(urlAtRevision('blob:abc', revision.current)).toBe('blob:abc');
	stop();
	detach();
});
