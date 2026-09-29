import { describe, expect, it } from 'vitest';
import { withoutSignIn } from '../../../../../../../electron/src/git/remote/gitRemote';

describe('a remote address shown in the window', () => {
	it('loses the sign-in in its user part, and nothing else', () => {
		expect(withoutSignIn('https://ada:secret@github.com/ada/thesis.git')).toBe('https://github.com/ada/thesis.git');
		expect(withoutSignIn('https://token-as-user@github.com/ada/thesis.git')).toBe('https://github.com/ada/thesis.git');
		expect(withoutSignIn('https://ada:p@ss@example.org/thesis.git')).toBe('https://example.org/thesis.git');
		expect(withoutSignIn('https://github.com/ada/thesis@v2.git')).toBe('https://github.com/ada/thesis@v2.git');
		expect(withoutSignIn('git@github.com:ada/thesis.git')).toBe('git@github.com:ada/thesis.git');
	});
});
