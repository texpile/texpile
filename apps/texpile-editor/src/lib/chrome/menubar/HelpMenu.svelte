<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import { contentClass, itemClass, separatorClass } from './menuBarStyles';
	import { updateState } from '$lib/updates';
	import { hasUnseenWhatsNew } from '$lib/whatsNew';
	import { m } from '$lib/paraglide/messages';

	const appVersion = __APP_VERSION__; // injected by Vite from package.json

	let { index, select, canTutorial }: { index: number; select: (value: string) => void; canTutorial: boolean } = $props();
</script>

<Menu onSelect={(d) => select(d.value)}>
	<!-- dot: an update finished downloading in the background, or there are release notes the
	     user has not opened. Either way the badge points at an item inside this menu. -->
	<MenuBarTrigger
		id="help"
		{index}
		label={m.menubar_menu_help()}
		dot={updateState.current.phase === 'downloaded' || hasUnseenWhatsNew.current}
	/>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={contentClass}>
				<Menu.Item value="shortcuts" class={itemClass}><Menu.ItemText>{m.menubar_keyboard_shortcuts()}</Menu.ItemText></Menu.Item>
				{#if canTutorial}
					<Menu.Item value="tutorial" class={itemClass}><Menu.ItemText>{m.menubar_open_tutorial()}</Menu.ItemText></Menu.Item>
				{/if}
				{#if !__WEB__}
					<Menu.Item value="whatsnew" class={itemClass}>
						<Menu.ItemText>{m.whatsnew_menu_label()}</Menu.ItemText>
						{#if hasUnseenWhatsNew.current}
							<span class="bg-primary-500 inline-block size-1.5 rounded-full"></span>
						{/if}
					</Menu.Item>
				{/if}
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="docs" class={itemClass}><Menu.ItemText>{m.menubar_documentation()}</Menu.ItemText></Menu.Item>
				<Menu.Item value="discord" class={itemClass}><Menu.ItemText>{m.menubar_join_discord()}</Menu.ItemText></Menu.Item>
				<Menu.Item value="support" class={itemClass}><Menu.ItemText>{m.menubar_contact_support()}</Menu.ItemText></Menu.Item>
				<!-- a web page updates by reloading; there is no installer to offer -->
				{#if !__WEB__}
					<Menu.Separator class={separatorClass} />
					<Menu.Item value="updates" class={itemClass}>
						<Menu.ItemText>{m.menubar_check_for_updates()}</Menu.ItemText>
						{#if updateState.current.phase === 'downloaded'}
							<span class="bg-primary-500 inline-block size-1.5 rounded-full"></span>
						{/if}
					</Menu.Item>
				{/if}
				<Menu.Separator class={separatorClass} />
				<!-- Dev Tools used to ride this line; it lives in the command palette now (search
				     "dev"), so the menu every writer opens carries no debugger furniture -->
				<div class="text-muted px-2.5 py-1 text-xs">{m.menubar_version_footer({ version: appVersion })}</div>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
