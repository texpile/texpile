// A name where something needs one: the Preferences name, then git's, and a question only when neither has one
import { describe, it, expect, vi, beforeEach } from 'vitest';

const userData = { current: { collabName: '', commentAuthor: '' } };
const updateUserData = vi.fn((patch: { collabName?: string }) => Object.assign(userData.current, patch));
const folderGitName = vi.fn(async (_root: string | null): Promise<string | null> => null);
vi.mock('$lib/storage/userData', () => ({ userData, updateUserData }));
vi.mock('$lib/comments/author', () => ({ folderGitName }));

const { ensureName, nameAsk } = await import('$lib/identity/ownName.svelte');

beforeEach(() => {
	userData.current = { collabName: '', commentAuthor: '' };
	updateUserData.mockClear();
	folderGitName.mockClear();
	folderGitName.mockResolvedValue(null);
});

describe('ensureName', () => {
	it('asks nothing when git has a name', async () => {
		folderGitName.mockResolvedValue('Ada Lovelace');
		expect(await ensureName('/p')).toBe(true);
		expect(nameAsk.open).toBe(false);
		expect(updateUserData).not.toHaveBeenCalled();
	});

	it('asks nothing when Preferences has one', async () => {
		userData.current.collabName = 'Ada';
		expect(await ensureName('/p')).toBe(true);
		expect(folderGitName).not.toHaveBeenCalled();
	});

	it('asks when there is none, and keeps the answer as the Preferences name', async () => {
		const asked = ensureName('/p');
		await vi.waitFor(() => expect(nameAsk.open).toBe(true));
		nameAsk.answer?.('  Ada  ');
		expect(await asked).toBe(true);
		expect(nameAsk.open).toBe(false);
		expect(updateUserData).toHaveBeenCalledWith({ collabName: 'Ada' });
	});

	it('asks once when two things need a name at the same time, and both get the answer', async () => {
		const first = ensureName('/p');
		const second = ensureName('/p');
		await vi.waitFor(() => expect(nameAsk.open).toBe(true));
		nameAsk.answer?.('Ada');
		expect(await Promise.all([first, second])).toEqual([true, true]);
		expect(nameAsk.open).toBe(false);
	});

	it('says no when the question is closed, so nothing goes ahead unsigned', async () => {
		const asked = ensureName('/p');
		await vi.waitFor(() => expect(nameAsk.open).toBe(true));
		nameAsk.answer?.(null);
		expect(await asked).toBe(false);
		expect(updateUserData).not.toHaveBeenCalled();
	});
});
