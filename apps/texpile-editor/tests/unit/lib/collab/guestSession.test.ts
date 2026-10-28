import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';

const doc = new Y.Doc();
const texts = new Map([['new.tex', doc.getText('new.tex')]]);
const fold = vi.fn((t: Y.Text, content: string) => {
	t.delete(0, t.length);
	t.insert(0, content);
});
vi.mock('$lib/collab/guestStore.svelte', () => ({
	collabGuest: {
		ytextFor: (rel: string) => texts.get(rel) ?? null,
		awareness: {},
		isLocked: () => false,
		files: [{ rel: 'new.tex', kind: 'text' }],
		fork: { fold: (t: Y.Text, content: string) => fold(t, content) }
	}
}));

const { guestSession } = await import('$lib/collab/guestSession');

describe('guestSession', () => {
	// a file made at the tree's root opens under the session's synthetic root, every other path is root-relative
	it('finds a file under the synthetic root by its root-relative name', () => {
		expect(guestSession.collabFor('session/new.tex')?.ytext).toBe(texts.get('new.tex'));
		expect(guestSession.sharedKindOf('session/new.tex')).toBe('text');
		guestSession.edit('session/new.tex', 'typed');
		expect(texts.get('new.tex')!.toString()).toBe('typed');
	});
});
