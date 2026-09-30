import { updateUserData, userData } from '$lib/storage/userData';

// two rows of the picker's grid
const MAX_RECENT_SYMBOLS = 20;

/** where each language's picks are kept, apart, so one list never names the other's symbols */
export type RecentSymbolsKey = 'recentTypstSymbols' | 'recentLatexSymbols';

/** `id` moved to the front of `recent`, once, the list kept to its length */
export function withRecentSymbol(recent: readonly string[], id: string): string[] {
	return [id, ...recent.filter((n) => n !== id)].slice(0, MAX_RECENT_SYMBOLS);
}

/** the ids picked lately, most recent first */
export function recentSymbols(key: RecentSymbolsKey): readonly string[] {
	return userData.current[key].slice(0, MAX_RECENT_SYMBOLS);
}

export function rememberSymbol(key: RecentSymbolsKey, id: string): void {
	updateUserData({ [key]: withRecentSymbol(userData.current[key], id) });
}
