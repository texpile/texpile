// @vitest-environment jsdom
import { it, expect, beforeEach } from 'vitest';
import { parentRepoToConfirm, useParentRepo } from '$lib/workspace/parentRepo.svelte';

beforeEach(() => localStorage.clear());

it('asks only about a repository above the folder, until the author says to use it', () => {
	expect(parentRepoToConfirm('/home/ada/thesis', '/home/ada/thesis')).toBeNull();
	expect(parentRepoToConfirm('/home/ada/thesis', null)).toBeNull();
	expect(parentRepoToConfirm('/home/ada/thesis', '/home/ada')).toBe('/home/ada');

	useParentRepo('/home/ada/thesis', '/home/ada');
	expect(parentRepoToConfirm('/home/ada/thesis', '/home/ada')).toBeNull();
	// the answer was about that repository: a different one above the folder is asked about afresh
	expect(parentRepoToConfirm('/home/ada/thesis', '/')).toBe('/');
	// and about that folder: another folder in the same repository is its own question
	expect(parentRepoToConfirm('/home/ada/notes', '/home/ada')).toBe('/home/ada');
});

it('remembers the answer on this machine', () => {
	useParentRepo('/srv/lab/paper', '/srv/lab');
	expect(localStorage.getItem('texpile:parentRepo:/srv/lab/paper')).toBe('/srv/lab');
});
