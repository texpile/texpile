<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import MenuBarSubmenu from './MenuBarSubmenu.svelte';
	import { menuContentClass, menuBarItemClass, separatorClass } from '$lib/menus/menuStyles';
	import { cursorInCm } from '$lib/stores/editorStore';
	import type { FileKind, formatOf } from '$lib/workspace/documentBuffer.svelte';
	import { combo } from '$lib/chrome/shortcutText';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		index: number;
		select: (value: string) => void;
		structured: boolean;
		dialect: ReturnType<typeof formatOf>;
		fileKind: FileKind;
		canFormatDocument: boolean;
	};

	let { index, select, structured, dialect, fileKind, canFormatDocument }: Props = $props();
</script>

<Menu onSelect={(d) => select(d.value)}>
	<MenuBarTrigger
		id="format"
		{index}
		label={m.menubar_menu_format()}
		disabled={!structured || cursorInCm.current}
		title={cursorInCm.current ? m.menubar_cursor_in_cm_hint() : ''}
	/>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<Menu.Item value="bold" class={menuBarItemClass}
					><Menu.ItemText>{m.menubar_format_bold()}</Menu.ItemText><span class="opacity-50">{combo('B')}</span></Menu.Item
				>
				<Menu.Item value="italic" class={menuBarItemClass}
					><Menu.ItemText>{m.menubar_format_italic()}</Menu.ItemText><span class="opacity-50">{combo('I')}</span></Menu.Item
				>
				<!-- markdown has no underline mark and no underline syntax -->
				{#if dialect !== 'md'}
					<Menu.Item value="underline" class={menuBarItemClass}
						><Menu.ItemText>{m.menubar_format_underline()}</Menu.ItemText><span class="opacity-50">{combo('U')}</span></Menu.Item
					>
				{/if}
				<Menu.Item value="code" class={menuBarItemClass}><Menu.ItemText>{m.menubar_format_inline_code()}</Menu.ItemText></Menu.Item>
				<!-- the styles the visual editor draws that no mark gives; each opens its own panel once in -->
				{#if dialect === 'tex'}
					<MenuBarSubmenu value="style" label={m.menubar_format_text_style()} select={(value) => select(`style:${value}`)}>
						<Menu.Item value="textsc" class={menuBarItemClass}><Menu.ItemText>{m.drawn_chip_style_small_caps()}</Menu.ItemText></Menu.Item>
						<Menu.Item value="textsf" class={menuBarItemClass}><Menu.ItemText>{m.drawn_chip_style_sans_serif()}</Menu.ItemText></Menu.Item>
						<Menu.Item value="textsl" class={menuBarItemClass}><Menu.ItemText>{m.drawn_chip_style_slanted()}</Menu.ItemText></Menu.Item>
						<Menu.Item value="large" class={menuBarItemClass}><Menu.ItemText>{m.drawn_chip_style_size()}</Menu.ItemText></Menu.Item>
						<Menu.Separator class={separatorClass} />
						<Menu.Item value="fbox" class={menuBarItemClass}><Menu.ItemText>{m.drawn_chip_style_framed()}</Menu.ItemText></Menu.Item>
						<Menu.Item value="mbox" class={menuBarItemClass}><Menu.ItemText>{m.drawn_chip_style_together()}</Menu.ItemText></Menu.Item>
					</MenuBarSubmenu>
				{/if}
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="h1" class={menuBarItemClass}><Menu.ItemText>{m.menubar_heading_1()}</Menu.ItemText></Menu.Item>
				<Menu.Item value="h2" class={menuBarItemClass}><Menu.ItemText>{m.menubar_heading_2()}</Menu.ItemText></Menu.Item>
				<Menu.Item value="h3" class={menuBarItemClass}><Menu.ItemText>{m.menubar_heading_3()}</Menu.ItemText></Menu.Item>
				<Menu.Item value="quote" class={menuBarItemClass}><Menu.ItemText>{m.menubar_format_blockquote()}</Menu.ItemText></Menu.Item>
				{#if canFormatDocument}
					<Menu.Separator class={separatorClass} />
					<Menu.Item value="format-document" class={menuBarItemClass}
						><Menu.ItemText>{m.menubar_format_document({ tool: fileKind === 'typ' ? 'typstyle' : 'latexindent' })}</Menu.ItemText
						></Menu.Item
					>
				{/if}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
