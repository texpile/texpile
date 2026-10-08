// Focus back on a slot showing the open file: the workspace takes the document that slot's editor has, which
// followed the other slot's typing, and never hands the editor its own older parse
import { describe, expect, it, vi } from 'vitest';
import { adoptOwnDoc } from '../../../../../src/views/workspace/groups/workspaceGroups';
import type { WorkspaceDoc } from '../../../../../src/views/workspace/workspaceDoc.svelte';

function workspace(texSource: string) {
	const doc = { texSource, visualDoc: 'parse' as unknown, lastDoc: 'parse' as unknown, lastDocSource: 'old' as string | null };
	const wsdoc = { doc, rebuildVisualFromSource: vi.fn() };
	return { doc, wsdoc: wsdoc as unknown as WorkspaceDoc, rebuild: wsdoc.rebuildVisualFromSource };
}

describe('adoptOwnDoc', () => {
	it("takes the slot's document when it is of the open text", () => {
		const { doc, wsdoc, rebuild } = workspace('text now');
		adoptOwnDoc(wsdoc, { doc: 'followed' as never, shown: { texSource: 'text now' } });
		expect(doc.visualDoc).toBe('followed');
		expect(doc.lastDoc).toBe('followed');
		expect(doc.lastDocSource).toBe('text now');
		expect(rebuild).not.toHaveBeenCalled();
	});

	it('parses the open text when the slot has not caught up with it', () => {
		const { doc, wsdoc, rebuild } = workspace('text now');
		adoptOwnDoc(wsdoc, { doc: 'behind' as never, shown: { texSource: 'text before' } });
		expect(doc.visualDoc).toBe('parse');
		expect(rebuild).toHaveBeenCalledOnce();
	});
});
