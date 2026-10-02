// What the agent asked to be allowed to do, held until the window answers. A turn that is cancelled, a
// closed window or an agent that exits answers every open question with cancelled, so nothing waits forever
import { randomUUID } from 'node:crypto';
import type { PermissionOption, RequestPermissionRequest, RequestPermissionResponse, ToolCallUpdate } from '@agentclientprotocol/sdk';

export type PermissionEvent =
	{ type: 'permission'; id: string; toolCall: ToolCallUpdate; options: PermissionOption[] } | { type: 'permission-done'; id: string };

export class PermissionQueue {
	private pending = new Map<string, (response: RequestPermissionResponse) => void>();

	constructor(private emit: (event: PermissionEvent) => void) {}

	ask(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
		const id = randomUUID();
		return new Promise((resolve) => {
			this.pending.set(id, resolve);
			this.emit({ type: 'permission', id, toolCall: request.toolCall, options: request.options });
		});
	}

	/** null declines without picking one of the agent's options */
	answer(id: string, optionId: string | null): void {
		const resolve = this.pending.get(id);
		if (!resolve) return;
		this.pending.delete(id);
		resolve(optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } });
		this.emit({ type: 'permission-done', id });
	}

	cancelAll(): void {
		for (const id of [...this.pending.keys()]) this.answer(id, null);
	}
}
