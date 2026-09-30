<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import MenuBarSubmenu from './MenuBarSubmenu.svelte';
	import { contentClass, itemClass, separatorClass } from './menuBarStyles';
	import { cursorInCm } from '$lib/stores/editorStore';
	import type { formatOf } from '$lib/workspace/documentBuffer.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		index: number;
		select: (value: string) => void;
		mathSelect: (value: string) => void;
		structured: boolean;
		dialect: ReturnType<typeof formatOf>;
		/** an image has to be written next to the document, so no imageDir means nowhere to put it */
		canInsertImage: boolean;
	};

	let { index, select, mathSelect, structured, dialect, canInsertImage }: Props = $props();
</script>

{#snippet item(value: string, label: string)}
	<Menu.Item {value} class={itemClass}><Menu.ItemText>{label}</Menu.ItemText></Menu.Item>
{/snippet}

<Menu onSelect={(d) => select(d.value)}>
	<MenuBarTrigger
		id="insert"
		{index}
		label={m.menubar_menu_insert()}
		disabled={!structured || cursorInCm.current}
		title={cursorInCm.current ? m.menubar_cursor_in_cm_hint() : ''}
	/>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={contentClass}>
				<MenuBarSubmenu value="math" label={m.menubar_insert_math_menu()} select={mathSelect}>
					{@render item('inline', m.menubar_inline_equation())}
					{@render item('display', m.menubar_display_equation())}
					<!-- LaTeX environments; a markdown document has nowhere to put \begin{align}, and a Typst one takes only those
					     that come back from Typst as themselves: mat(), cases() and & alignment -->
					{#if dialect === 'tex'}
						<Menu.Separator class={separatorClass} />
						{#each ['align', 'aligned', 'gather', 'cases', 'multline', 'split'] as env (env)}
							{@render item(env, env[0].toUpperCase() + env.slice(1))}
						{/each}
						<Menu.Separator class={separatorClass} />
						{@render item('bmatrix', m.menubar_math_matrix_square())}
						{@render item('pmatrix', m.menubar_math_matrix_paren())}
					{:else if dialect === 'typ'}
						<Menu.Separator class={separatorClass} />
						{@render item('aligned', 'Aligned')}
						{@render item('cases', 'Cases')}
						<Menu.Separator class={separatorClass} />
						{@render item('bmatrix', m.menubar_math_matrix_square())}
						{@render item('pmatrix', m.menubar_math_matrix_paren())}
					{/if}
				</MenuBarSubmenu>
				{#if canInsertImage}
					{@render item('image', m.menubar_insert_image())}
				{/if}
				{@render item('table', m.menubar_insert_table())}
				{@render item('link', m.menubar_insert_link())}
				{@render item('code', m.menubar_insert_code_block())}
				{@render item('hrule', m.menubar_insert_hrule())}
				<!-- what the visual editor draws in place of LaTeX or Typst commands, grouped so the menu stays shorter than
				     a window; each drawn one opens its own panel once in -->
				{#if dialect === 'tex'}
					<Menu.Separator class={separatorClass} />
					<MenuBarSubmenu value="references" label={m.menubar_insert_references()} {select}>
						{@render item('citation', m.menubar_insert_citation())}
						{@render item('crossref', m.menubar_insert_cross_reference())}
						{@render item('hyperref', m.drawn_chip_hyperref_title())}
						{@render item('label', m.menubar_insert_label())}
						{@render item('footnote', m.drawn_chip_footnote_label())}
					</MenuBarSubmenu>
					<MenuBarSubmenu value="breaks" label={m.menubar_insert_breaks_spaces()} {select}>
						{@render item('pagebreak', m.drawn_chip_page_label())}
						{@render item('vspace', m.drawn_chip_space_vertical())}
						{@render item('hspace', m.drawn_chip_space_horizontal())}
					</MenuBarSubmenu>
					{@render item('symbolpicker', m.menubar_insert_symbol_picker())}
					<MenuBarSubmenu value="document" label={m.menubar_insert_document_parts()} {select}>
						{@render item('abstract', m.blockmenu_abstract())}
						{@render item('appendix', m.drawn_chip_appendix_title())}
						{@render item('bibliography', m.drawn_chip_bib_title())}
						{@render item('include', m.menubar_insert_include_file())}
					</MenuBarSubmenu>
					<Menu.Separator class={separatorClass} />
					<MenuBarSubmenu value="latex" label={m.menubar_insert_latex_source()} {select}>
						{@render item('environment', m.menubar_insert_environment())}
						{@render item('rawlatex', m.menubar_insert_raw_latex())}
						{@render item('inlinelatex', m.menubar_insert_inline_latex())}
						{@render item('comment', m.drawn_chip_comment_title())}
					</MenuBarSubmenu>
				{:else if dialect === 'typ'}
					<Menu.Separator class={separatorClass} />
					<MenuBarSubmenu value="references" label={m.menubar_insert_references()} {select}>
						{@render item('citation', m.menubar_insert_citation())}
						{@render item('crossref', m.menubar_insert_cross_reference())}
						{@render item('label', m.menubar_insert_label())}
						{@render item('footnote', m.drawn_chip_footnote_label())}
					</MenuBarSubmenu>
					<MenuBarSubmenu value="breaks" label={m.menubar_insert_breaks_spaces()} {select}>
						{@render item('pagebreak', m.drawn_chip_page_label())}
						{@render item('vspace', m.drawn_chip_space_vertical())}
						{@render item('hspace', m.drawn_chip_space_horizontal())}
					</MenuBarSubmenu>
					{@render item('symbolpicker', m.menubar_insert_symbol_picker())}
					<MenuBarSubmenu value="document" label={m.menubar_insert_document_parts()} {select}>
						{@render item('outline', m.drawn_chip_typst_outline_contents())}
						{@render item('bibliography', m.drawn_chip_bib_title())}
						{@render item('include', m.menubar_insert_include_file())}
					</MenuBarSubmenu>
					<Menu.Separator class={separatorClass} />
					<MenuBarSubmenu value="typst" label={m.menubar_insert_typst_source()} {select}>
						{@render item('environment', m.menubar_insert_environment())}
						{@render item('rawtypst', m.menubar_insert_raw_typst())}
						{@render item('inlinetypst', m.menubar_insert_inline_typst())}
						{@render item('comment', m.menubar_insert_source_comment())}
					</MenuBarSubmenu>
				{/if}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
