// The custom service's key, sealed by the system keychain the way git sign-ins are. The window never reads it back
import { readSettings } from '../../appSettings';
import { keychainVault, memoryVault, SignIns } from '../../git/auth/gitSignIns';

const KEY = 'service';

let keys: SignIns | null = null;

/** made on first use: safeStorage needs the app ready */
function store(): SignIns {
	if (!keys) {
		const keychain = keychainVault('ai-keys.json');
		keys = keychain ? new SignIns(keychain) : new SignIns(memoryVault(), false);
		// the Anthropic and OpenAI choices each kept a key, before one custom service replaced both
		const url = String(readSettings().aiServiceUrl ?? '');
		const old = keys.recall(/anthropic\.com/i.test(url) ? 'anthropic' : 'openai');
		if (old && !keys.recall(KEY)) keys.keep([[KEY, old]]);
		keys.forget(['anthropic', 'openai']);
	}
	return keys;
}

export function serviceKey(): string | null {
	return store().recall(KEY);
}

/** an empty key removes the one kept */
export function setServiceKey(key: string): void {
	if (key) store().keep([[KEY, key]]);
	else store().forget([KEY]);
}

/** `lasting` is false where there is no keychain: a key is kept until Texpile quits */
export function serviceKeyKept(): { saved: boolean; lasting: boolean } {
	return { saved: !!serviceKey(), lasting: store().lasting };
}
