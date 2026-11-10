// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { collabGuest } from '$lib/collab/guestStore.svelte';

// the workspace leaves the session as it unmounts, in an effect teardown, which reads the status from before the end
it('keeps the goodbye when the workspace leaves after the host ended the session', () => {
	let mounted = $state(true);
	const stop = $effect.root(() => {
		$effect(() => {
			if (!mounted) return;
			return () => collabGuest.leave();
		});
	});
	flushSync();
	collabGuest.status = 'ended';
	collabGuest.endedReason = 'host-ended';
	mounted = false;
	flushSync();
	expect(collabGuest.status).toBe('ended');
	expect(collabGuest.endedReason).toBe('host-ended');
	stop();
});
