// The API keys proofreading sends with, sealed by the system keychain the way git sign-ins are. The window never reads
// one back
import { keychainVault, memoryVault, SignIns } from '../../git/auth/gitSignIns';

export type KeyProvider = 'anthropic' | 'openai';

export const KEY_PROVIDERS: KeyProvider[] = ['anthropic', 'openai'];

let keys: SignIns | null = null;

/** made on first use: safeStorage needs the app ready */
function store(): SignIns {
	if (!keys) {
		const keychain = keychainVault('ai-keys.json');
		keys = keychain ? new SignIns(keychain) : new SignIns(memoryVault(), false);
	}
	return keys;
}

export function proofreadKey(provider: KeyProvider): string | null {
	return store().recall(provider);
}

/** an empty key removes the one kept */
export function setProofreadKey(provider: KeyProvider, key: string): void {
	if (key) store().keep([[provider, key]]);
	else store().forget([provider]);
}

/** `lasting` is false where there is no keychain: a key is kept until Texpile quits */
export function proofreadKeysKept(): { anthropic: boolean; openai: boolean; lasting: boolean } {
	return { anthropic: !!proofreadKey('anthropic'), openai: !!proofreadKey('openai'), lasting: store().lasting };
}
