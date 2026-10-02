// The window's side of the agent conversation (preload's texpileAcp). Absent outside the desktop app
import type { AcpEvent, ChatInfo, PromptResult, StartResult } from './agentPanel.types';

export type AcpBridge = {
	detect(): Promise<Record<string, boolean>>;
	start(): Promise<StartResult>;
	prompt(blocks: unknown[]): Promise<PromptResult>;
	cancel(): void;
	answer(id: string, optionId: string | null): void;
	setConfig(configId: string, value: string): Promise<void>;
	chats(): Promise<ChatInfo[]>;
	openChat(id: string): Promise<{ ok: boolean; error?: string }>;
	close(): void;
	onEvent(cb: (event: AcpEvent) => void): () => void;
};

export function acpBridge(): AcpBridge | undefined {
	return (globalThis as { texpileAcp?: AcpBridge }).texpileAcp;
}
