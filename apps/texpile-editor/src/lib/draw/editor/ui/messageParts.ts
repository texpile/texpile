export type MessagePart = { text: string } | { slot: string };

export function messageParts(text: string, slots: readonly string[]): MessagePart[] {
	return text.split(new RegExp(`\\{(${slots.join('|')})\\}`)).map((part, k) => (k % 2 ? { slot: part } : { text: part }));
}
