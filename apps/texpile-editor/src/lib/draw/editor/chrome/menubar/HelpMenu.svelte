<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { menuContentClass, separatorClass } from '../../ui/menuStyles';
	import MenuBarItem from './MenuBarItem.svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';

	// Texpile's own places for questions and problems
	const LINKS: Record<string, string> = {
		discord: 'https://discord.gg/7wanVzCBWf',
		report: 'https://github.com/texpile/texpile/issues/new?template=bug_report.yml'
	};

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	function selectHelpItem(value: string) {
		if (value === 'shortcuts') props.editor.shortcutsShown = true;
		else window.open(value === 'manual' ? props.editor.language.manual.url : LINKS[value], '_blank', 'noopener,noreferrer');
	}
</script>

<Menu onSelect={(d) => selectHelpItem(d.value)}>
	<MenuBarTrigger label="Help" />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<MenuBarItem value="shortcuts" label="Keyboard shortcuts" shortcut="?" />
				<MenuBarItem value="manual" label={props.editor.language.manual.label} />
				<Menu.Separator class={separatorClass} />
				<MenuBarItem value="discord" label="Join Discord" />
				<MenuBarItem value="report" label="Report a problem…" />
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
