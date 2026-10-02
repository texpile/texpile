// an answer to a permission request, named by its kind so it reads the same in every agent
import { m } from '$lib/paraglide/messages';

export function permissionOptionLabel(kind: string, name: string): string {
	if (kind === 'allow_once') return m.agent_panel_allow_once();
	if (kind === 'allow_always') return m.agent_panel_allow_always();
	if (kind === 'reject_once') return m.agent_panel_deny();
	if (kind === 'reject_always') return m.agent_panel_deny_always();
	return name;
}
