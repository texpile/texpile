// Sign-ins typed into the askpass prompt, kept for next time when git has no credential helper of
// its own to keep them - which on Linux, and on a Mac where nobody set one up, is the common case:
// every Sync asked for the password again. Kept only once the operation they were typed for
// worked, encrypted by the system keychain (Electron's safeStorage), and forgotten as soon as one
// is refused, so the next attempt asks instead of failing with the old one.
//
// Only usernames and passwords (tokens) for https hosts. An SSH key's passphrase belongs to
// ssh-agent, and a host key's fingerprint must never be answered for the author.
import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** where the encrypted answers live, and how they are sealed: injectable for the tests */
export type SignInVault = {
	encrypt(plain: string): string;
	decrypt(sealed: string): string | null;
	read(): Record<string, string>;
	write(all: Record<string, string>): void;
};

/** keyed by git's own question ("Password for 'https://ada@github.com': "), which names the host
 *  and, for a password, the account: exactly the scope an answer is good for */
export class SignIns {
	/** `lasting`: kept across restarts (the keychain); false for the in-memory one, until quit */
	constructor(
		private vault: SignInVault | null,
		readonly lasting = true
	) {}

	get available(): boolean {
		return !!this.vault;
	}

	recall(prompt: string): string | null {
		if (!this.vault) return null;
		const sealed = this.vault.read()[prompt];
		return sealed ? this.vault.decrypt(sealed) : null;
	}

	keep(answers: Iterable<[string, string]>): void {
		if (!this.vault) return;
		const all = this.vault.read();
		let changed = false;
		for (const [prompt, answer] of answers) {
			all[prompt] = this.vault.encrypt(answer);
			changed = true;
		}
		if (changed) this.vault.write(all);
	}

	forget(prompts: Iterable<string>): void {
		if (!this.vault) return;
		const all = this.vault.read();
		let changed = false;
		for (const prompt of prompts) changed = delete all[prompt] || changed;
		if (changed) this.vault.write(all);
	}

	forgetAll(): void {
		this.vault?.write({});
	}
}

// failures that come after the host let the author in: the sign-in worked even though the
// operation did not (a conflict to combine, a remote that moved on, a rule GitHub enforces, an
// account that may not write here, a repository name already taken)
const SIGNED_IN_FAILURES = new Set(['conflict', 'rejected', 'secret', 'protected', 'forbidden', 'exists']);

// ssh refusing the author's key (or an unknown host) is an 'auth' failure too, but no password
// was refused, so no sign-in is to blame for it
const SSH_REFUSED_RE = /permission denied \(publickey|host key verification failed|no such identity/i;

/** the host refused a username and password (or token): an SSH key refused is not that */
export function refusedPassword(result: { ok: boolean; failure?: string; error?: string }): boolean {
	return !result.ok && result.failure === 'auth' && !SSH_REFUSED_RE.test(result.error ?? '');
}

/** After an operation: what was typed is kept if it worked - the operation succeeding, or failing
 *  only after the host accepted it - and what the keychain answered is dropped if the host refused
 *  it, so the next attempt asks rather than failing the same way. */
export function settle(
	store: SignIns,
	result: { ok: boolean; failure?: string; error?: string },
	typed: Map<string, string>,
	recalled: Set<string>
): void {
	if (result.ok || SIGNED_IN_FAILURES.has(result.failure ?? '')) store.keep(typed);
	else if (refusedPassword(result)) store.forget(recalled);
}

/** the questions worth keeping an answer to */
export function keepable(subject: string): boolean {
	return subject === 'username' || subject === 'password';
}

/**
 * Where there is no keychain (Linux without one): kept in memory until Texpile quits, never
 * written anywhere, so a writer is not asked for the same password on every Sync, and the
 * automatic check can run. VS Code keeps nothing and asks each time.
 */
export function memoryVault(): SignInVault {
	let all: Record<string, string> = {};
	return {
		encrypt: (plain) => plain,
		decrypt: (sealed) => sealed,
		read: () => ({ ...all }),
		write: (next) => {
			all = { ...next };
		}
	};
}

/** the keychain-backed vault, or null where there is no keychain to seal with: on Linux without
 *  one, Electron falls back to a fixed key, which would be the password in plain text by another name */
export function keychainVault(): SignInVault | null {
	try {
		if (!safeStorage.isEncryptionAvailable()) return null;
		if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return null;
	} catch {
		return null;
	}
	const file = join(app.getPath('userData'), 'git-sign-ins.json');
	return {
		encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
		decrypt: (sealed) => {
			try {
				return safeStorage.decryptString(Buffer.from(sealed, 'base64'));
			} catch {
				return null; // sealed by another user's keychain, or the keychain was reset
			}
		},
		read: () => {
			try {
				const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
				return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
			} catch {
				return {};
			}
		},
		write: (all) => writeFileSync(file, JSON.stringify(all), { mode: 0o600 })
	};
}
