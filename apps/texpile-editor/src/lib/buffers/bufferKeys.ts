import { fileIdentityKey } from '$lib/files/identity/fileUris';

/** the spelling each held file was first named by, so another spelling finds the same buffer */
export class BufferKeys {
	private readonly spellings = new Map<string, string>();

	remember(key: string): void {
		this.spellings.set(fileIdentityKey(key), key);
	}

	forget(key: string): void {
		if (this.spellings.get(fileIdentityKey(key)) === key) this.spellings.delete(fileIdentityKey(key));
	}

	canonical(key: string): string {
		return this.spellings.get(fileIdentityKey(key)) ?? key;
	}
}
