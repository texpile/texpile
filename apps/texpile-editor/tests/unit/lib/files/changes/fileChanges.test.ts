import { describe, expect, it } from 'vitest';
import { FileChangesEvent } from '$lib/files/changes/fileChanges';
import { fileUriOf } from '$lib/files/identity/fileUris';

const event = new FileChangesEvent([
	{ type: 'updated', resource: fileUriOf('/p/sections/intro.tex') },
	{ type: 'deleted', resource: fileUriOf('/p/figs') }
]);

describe('FileChangesEvent', () => {
	it('matches a file under a deleted folder, and a folder above a change only through affects', () => {
		expect(event.contains(fileUriOf('/p/figs/plot.pdf'), 'deleted')).toBe(true);
		expect(event.contains(fileUriOf('/p/figs/plot.pdf'), 'updated')).toBe(false);
		expect(event.contains(fileUriOf('/p/sections'))).toBe(false);
		expect(event.affects(fileUriOf('/p/sections'))).toBe(true);
		expect(event.affects(fileUriOf('/p/section'))).toBe(false);
	});
});
