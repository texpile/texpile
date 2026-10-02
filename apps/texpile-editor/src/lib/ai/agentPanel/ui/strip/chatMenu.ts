// the agent's earlier chats as the strip's dropdown lists them: newest first, each with when it was last used
import { m } from '$lib/paraglide/messages';
import type { DropdownGroup } from '$lib/menus/MenuDropdown.svelte';
import type { ChatInfo } from '../../agentPanel.types';

const MOST_CHATS = 30;
// an agent titles a chat with its first message, which can run to a paragraph
const MOST_TITLE = 60;

function lastUsed(updatedAt: string | null): string | undefined {
	const at = updatedAt ? new Date(updatedAt) : null;
	return at && !Number.isNaN(at.getTime()) ? at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : undefined;
}

function chatTitle(chat: ChatInfo): string {
	const title = chat.title?.replace(/\s+/g, ' ').trim();
	if (!title) return m.agent_panel_chat_untitled();
	return title.length > MOST_TITLE ? `${title.slice(0, MOST_TITLE).trimEnd()}…` : title;
}

export function chatMenu(chats: ChatInfo[], open: string | null): DropdownGroup[] {
	const options = chats
		.slice(0, MOST_CHATS)
		.map((c) => ({ value: c.id, label: chatTitle(c), note: lastUsed(c.updatedAt), checked: c.id === open }));
	return [{ label: m.agent_panel_chats(), options }];
}
