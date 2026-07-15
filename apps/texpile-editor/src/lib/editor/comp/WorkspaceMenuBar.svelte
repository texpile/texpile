<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Check, ChevronRight, X } from '@lucide/svelte';
	import { get } from 'svelte/store';
	import { editorViewStore, referenceStore, editorConfigStore, cursorInCm } from '$lib/stores/editorStore';
	import { recentFolders } from '$lib/workspace/workspaceStore';
	import { basename } from '$lib/workspace/fileSystem';
	import { isMac } from '$lib/platform';
	import { setSpellcheckEnabled } from '$lib/editor/extensions/spellcheck/spellcheckConfig';
	import SpellcheckDictionary from './SpellcheckDictionary.svelte';
	import PreferencesDialog from './PreferencesDialog.svelte';
	const appVersion = __APP_VERSION__; // injected by Vite from package.json
	import { toggleMark } from 'prosemirror-commands';
	import { schema } from '$lib/schema/schema';
	import { createMathField } from '$lib/editor/extensions/mathlivebridge/mlcommands';
	import { computeMathAttrs } from '$lib/editor/extensions/mathlivebridge/mlview.svelte';
	import { createCodeBlock } from '$lib/editor/extensions/codemirrorbridge/cmcommands';
	import { createTableNode } from '$lib/editor/utils/tableUtils';
	import { startImageUpload } from '$lib/editor/extensions/image';
	import { createLocalImageSettings } from '$lib/editor/extensions/image/imageplugin.svelte';
	import { run, insertNode, activeCm, cmReplace, editSelect, formatSelect } from './menuBarCommands';
	import { checkForUpdate, updateModalOpen, updateState } from '$lib/updates';
	import { toaster } from '$lib/modals/toaster-svelte';
	import type { Node as PMNode } from 'prosemirror-model';

	interface Props {
		disabled?: boolean;
		imageDir?: string;
		/** Create a new file. `ext` (tex/bib/cls/sty) seeds the name + content; omitted = a plain new file. */
		onNewFile?: (ext?: string) => void;
		onOpenFolder?: (path?: string) => void;
		/** Close the current folder and return to the Start screen. */
		onCloseWorkspace?: () => void;
		onSave?: () => void;
		/** Terminal menu (shown only in the desktop app). */
		terminalAvailable?: boolean;
		terminalVisible?: boolean;
		onCompile?: () => void;
		onConfigureCompile?: () => void;
		onNewTerminal?: () => void;
		onToggleTerminal?: () => void;
		/** Reindent the current document via latexindent (opens the confirm-first modal). */
		onFormatDocument?: () => void;
		/** Open the bundled Texpile Tutorial project (switches the workspace to it). */
		onOpenTutorial?: () => void;
		/** whole-window zoom, shown as a percentage in the View menu. */
		uiZoomPercent?: number;
		onZoomIn?: () => void;
		onZoomOut?: () => void;
		onZoomReset?: () => void;
	}
	let {
		disabled = false,
		imageDir,
		onNewFile,
		onOpenFolder,
		onCloseWorkspace,
		onSave,
		terminalAvailable = false,
		terminalVisible = false,
		onCompile,
		onConfigureCompile,
		onNewTerminal,
		onToggleTerminal,
		onFormatDocument,
		onOpenTutorial,
		uiZoomPercent = 100,
		onZoomIn,
		onZoomOut,
		onZoomReset
	}: Props = $props();

	function viewSelect(value: string) {
		if (value === 'zoom-in') onZoomIn?.();
		else if (value === 'zoom-out') onZoomOut?.();
		else if (value === 'zoom-reset') onZoomReset?.();
	}

	let imageInput: HTMLInputElement;
	function pickImage() {
		if (imageDir) imageInput?.click();
	}
	function onImagePicked(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		const v = $editorViewStore;
		if (!file || !imageDir || !v) return;
		startImageUpload(v, file, 'Image', createLocalImageSettings(imageDir), schema);
		v.focus();
	}

	// Electron has no window.prompt(), so a small custom modal
	let promptOpen = $state(false);
	let promptTitle = $state('');
	let promptValue = $state('');
	let promptResolve: ((v: string | null) => void) | null = null;
	let promptInput = $state<HTMLInputElement>();
	function askText(title: string, initial = ''): Promise<string | null> {
		promptTitle = title;
		promptValue = initial;
		promptOpen = true;
		setTimeout(() => promptInput?.select(), 0);
		return new Promise((resolve) => (promptResolve = resolve));
	}
	function closePrompt(ok: boolean) {
		promptOpen = false;
		promptResolve?.(ok ? promptValue : null);
		promptResolve = null;
	}

	const SUPPORT_EMAIL = 'support@texpile.com';
	let shortcutsOpen = $state(false);
	let supportOpen = $state(false);
	let copied = $state(false);
	function helpSelect(value: string) {
		if (value === 'shortcuts') shortcutsOpen = true;
		else if (value === 'discord') window.open('https://discord.gg/7wanVzCBWf', '_blank', 'noopener,noreferrer');
		else if (value === 'support') {
			copied = false;
			supportOpen = true;
		} else if (value === 'updates') void checkUpdates();
	}

	async function checkUpdates() {
		// a check while a download is in flight would reset the state; just reopen the modal
		const phase = get(updateState).phase;
		if (phase === 'downloading' || phase === 'downloaded') {
			updateModalOpen.set(true);
			return;
		}
		const status = await checkForUpdate(true);
		if (status === 'update') updateModalOpen.set(true);
		else if (status === 'none')
			toaster.info({ title: 'No update available', description: `Texpile v${appVersion} is the latest version.` });
		else if (status === 'error')
			toaster.error({ title: 'Could not check for updates', description: 'Check your internet connection and try again.' });
		else toaster.info({ title: 'Updates are not available in this build' });
	}
	async function copyEmail() {
		try {
			await navigator.clipboard.writeText(SUPPORT_EMAIL);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}

	// platform-aware shortcut labels: Ctrl/Shift/Alt on win/linux, ⌘/⇧/⌥ on mac
	function combo(mods: { shift?: boolean; alt?: boolean }, key: string): string {
		if (isMac) return `${mods.alt ? '⌥' : ''}${mods.shift ? '⇧' : ''}⌘${key}`;
		const parts = ['Ctrl'];
		if (mods.shift) parts.push('Shift');
		if (mods.alt) parts.push('Alt');
		parts.push(key);
		return parts.join('+');
	}
	const SHORTCUTS: { group: string; items: { keys: string; label: string }[] }[] = [
		{
			group: 'General',
			items: [
				{ keys: combo({}, 'S'), label: 'Save' },
				{ keys: combo({}, 'F'), label: 'Find in document' },
				{ keys: combo({ shift: true }, 'F'), label: 'Find in files' },
				{ keys: combo({}, 'Z'), label: 'Undo' },
				{ keys: combo({ shift: true }, 'Z'), label: 'Redo' }
			]
		},
		{
			group: 'View',
			items: [
				{ keys: isMac ? '⌘ +' : 'Ctrl +', label: 'Zoom in interface' },
				{ keys: isMac ? '⌘ −' : 'Ctrl −', label: 'Zoom out interface' },
				{ keys: isMac ? '⌘ 0' : 'Ctrl 0', label: 'Reset interface zoom' }
			]
		},
		{
			group: 'Compile',
			items: [{ keys: combo({ alt: true }, 'Enter'), label: 'Compile (Stop if already running)' }]
		},
		{
			group: 'Formatting',
			items: [
				{ keys: combo({}, 'B'), label: 'Bold' },
				{ keys: combo({}, 'I'), label: 'Italic' },
				{ keys: combo({}, 'U'), label: 'Underline' },
				{ keys: combo({}, '`'), label: 'Inline code' },
				{ keys: combo({}, '.'), label: 'Superscript' },
				{ keys: combo({}, ','), label: 'Subscript' },
				{ keys: combo({ shift: true }, 'B'), label: 'Block quote' },
				{ keys: combo({ shift: true }, '`'), label: 'Code block' },
				{
					keys: isMac
						? `${combo({ alt: true }, '1')} … ${combo({ alt: true }, '3')}`
						: `${combo({ shift: true }, '1')} … ${combo({ shift: true }, '3')}`,
					label: 'Heading 1–3'
				}
			]
		},
		{
			group: 'Math',
			items: [
				{ keys: combo({}, 'M'), label: 'Inline math' },
				{ keys: combo({ shift: true }, 'M'), label: 'Display math' }
			]
		}
	];

	let prefsOpen = $state(false);
	function fileSelect(value: string) {
		if (value === 'save') onSave?.();
		else if (value === 'close-workspace') onCloseWorkspace?.();
		else if (value === 'preferences') prefsOpen = true;
	}
	function newFileSelect(ext: string) {
		onNewFile?.(ext);
	}

	// "newfolder" opens the native picker; any other value is a recent folder path
	function openFolderSelect(value: string) {
		if (value === 'newfolder') onOpenFolder?.();
		else onOpenFolder?.(value);
	}

	// display-math templates; block_math detects the environment from content (computeMathAttrs)
	const MATH_ENVS: Record<string, string> = {
		align: '\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}',
		aligned: '\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}',
		gather: '\\begin{gather}\na + b \\\\\nc + d\n\\end{gather}',
		cases: 'f(x) = \\begin{cases}\nx & \\text{if } x \\geq 0 \\\\\n-x & \\text{otherwise}\n\\end{cases}',
		multline: '\\begin{multline}\na + b + c \\\\\n+ d + e + f\n\\end{multline}',
		split: '\\begin{split}\na &= b \\\\\n&= c\n\\end{split}',
		bmatrix: '\\begin{bmatrix}\na & b \\\\\nc & d\n\\end{bmatrix}',
		pmatrix: '\\begin{pmatrix}\na & b \\\\\nc & d\n\\end{pmatrix}'
	};
	function insertMathEnvironment(latex: string) {
		const v = $editorViewStore;
		if (!v) return;
		const node = v.state.schema.nodes.block_math.create(computeMathAttrs(latex), v.state.schema.text(latex));
		v.dispatch(v.state.tr.replaceSelectionWith(node));
		v.focus();
	}
	function mathSelect(value: string) {
		const cm = activeCm();
		if (cm) {
			if (value === 'inline') cmReplace(cm, '$', '$');
			else if (value === 'display') cmReplace(cm, '\\[\n', '\n\\]');
			else if (MATH_ENVS[value]) cmReplace(cm, MATH_ENVS[value]);
			return;
		}
		if (value === 'inline') run(createMathField());
		else if (value === 'display') run(createMathField(true));
		else if (MATH_ENVS[value]) insertMathEnvironment(MATH_ENVS[value]);
	}

	async function insertSelect(value: string) {
		const cm = activeCm();
		if (cm) {
			switch (value) {
				case 'code':
					cmReplace(cm, '\\begin{verbatim}\n', '\n\\end{verbatim}');
					break;
				case 'table':
					cmReplace(cm, '\\begin{tabular}{ccc}\n  a & b & c \\\\\n  d & e & f \\\\\n\\end{tabular}');
					break;
				case 'image':
					cmReplace(cm, '\\includegraphics{', '}');
					break;
				case 'hrule':
					cmReplace(cm, '\\rule{\\linewidth}{0.4pt}');
					break;
				case 'link': {
					const href = await askText('Link URL', 'https://');
					if (href) cmReplace(cm, `\\href{${href}}{`, '}');
					break;
				}
				case 'citation': {
					const key = get(referenceStore)?.[0]?.key ?? 'key';
					cmReplace(cm, `\\autocite{${key}}`);
					break;
				}
				case 'environment': {
					const name = (await askText('Environment name (e.g. center, quote, abstract)', 'center'))?.trim();
					if (name) cmReplace(cm, `\\begin{${name}}\n`, `\n\\end{${name}}`);
					break;
				}
				// rawlatex / inlinelatex are PM-only nodes; in CM you're already writing LaTeX
			}
			return;
		}
		switch (value) {
			case 'code':
				run(createCodeBlock());
				break;
			case 'table':
				insertNode((state) => createTableNode(state.schema, 3, 3) as unknown as PMNode);
				break;
			case 'image':
				pickImage();
				break;
			case 'rawlatex':
				insertNode((state) => state.schema.nodes.raw_latex.create(null, state.schema.text('\\textbf{LaTeX}')));
				break;
			case 'inlinelatex':
				insertNode((state) => state.schema.nodes.inline_latex.create(null, state.schema.text('\\LaTeX')));
				break;
			case 'hrule':
				insertNode((state) => state.schema.nodes.horizontal_rule.create());
				break;
			case 'link': {
				const href = await askText('Link URL', 'https://');
				if (href) run(toggleMark(schema.marks.link, { href, title: null }));
				break;
			}
			case 'citation': {
				const key = get(referenceStore)?.[0]?.key ?? 'key';
				insertNode((state) => state.schema.nodes.citation.create({ variant: 'autocite' }, state.schema.text(key)));
				break;
			}
			case 'environment': {
				const name = await askText('Environment name (e.g. center, quote, abstract)', 'center');
				if (name?.trim())
					insertNode((state) => state.schema.nodes.environment.create({ name: name.trim() }, state.schema.nodes.paragraph.create()));
				break;
			}
		}
	}

	const spellcheckOn = $derived($editorConfigStore?.spellcheck ?? false);
	let dictionaryOpen = $state(false);
	function spellcheckSelect(value: string) {
		if (value === 'toggle') setSpellcheckEnabled(!spellcheckOn);
		else if (value === 'dictionary') dictionaryOpen = true;
	}

	function terminalSelect(value: string) {
		switch (value) {
			case 'compile':
				onCompile?.();
				break;
			case 'configure':
				onConfigureCompile?.();
				break;
			case 'new':
				onNewTerminal?.();
				break;
			case 'toggle':
				onToggleTerminal?.();
				break;
		}
	}

	const triggerClass = 'rounded-base px-2.5 py-1 text-sm hover:preset-tonal data-[disabled]:opacity-40';
	const contentClass = 'card bg-surface-50-950 border-surface-200-800 z-[1200] flex min-w-48 flex-col gap-0 border p-1 shadow-xl';
	const itemClass =
		'flex cursor-pointer items-center justify-between gap-6 rounded-base px-2.5 py-1 text-sm hover:preset-tonal data-[disabled]:opacity-40';
</script>

<!-- preventDefault on mousedown so opening a menu doesn't blur the editor; inserts land at the cursor -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<nav class="border-surface-200-800 flex items-center gap-0.5 border-b px-2 py-0.5" data-keep-caret onmousedown={(e) => e.preventDefault()}>
	<Menu onSelect={(d) => fileSelect(d.value)}>
		<Menu.Trigger class={triggerClass}>File</Menu.Trigger>
		<Portal>
			<Menu.Positioner>
				<Menu.Content class={contentClass}>
					<Menu onSelect={(d) => newFileSelect(d.value)}>
						<Menu.TriggerItem value="new" class={itemClass}>
							<Menu.ItemText>New</Menu.ItemText><ChevronRight class="size-4 opacity-60" />
						</Menu.TriggerItem>
						<Portal>
							<Menu.Positioner>
								<Menu.Content class={contentClass}>
									<Menu.Item value="tex" class={itemClass}><Menu.ItemText>LaTeX document (.tex)</Menu.ItemText></Menu.Item>
									<Menu.Item value="bib" class={itemClass}><Menu.ItemText>BibTeX bibliography (.bib)</Menu.ItemText></Menu.Item>
									<Menu.Item value="cls" class={itemClass}><Menu.ItemText>Document class (.cls)</Menu.ItemText></Menu.Item>
									<Menu.Item value="sty" class={itemClass}><Menu.ItemText>Package / style (.sty)</Menu.ItemText></Menu.Item>
								</Menu.Content>
							</Menu.Positioner>
						</Portal>
					</Menu>
					<Menu onSelect={(d) => openFolderSelect(d.value)}>
						<Menu.TriggerItem value="openfolder" class={itemClass}>
							<Menu.ItemText>Open folder</Menu.ItemText><ChevronRight class="size-4 opacity-60" />
						</Menu.TriggerItem>
						<Portal>
							<Menu.Positioner>
								<Menu.Content class={contentClass}>
									<Menu.Item value="newfolder" class={itemClass}><Menu.ItemText>Open New Folder…</Menu.ItemText></Menu.Item>
									{#if $recentFolders.length > 0}
										<Menu.Separator class="border-surface-200-800 my-1 border-t" />
										<div class="text-surface-500 px-2.5 py-0.5 text-xs font-semibold tracking-wider uppercase">Recent</div>
										{#each $recentFolders as folder (folder)}
											<Menu.Item value={folder} class={itemClass}>
												<Menu.ItemText class="block max-w-64 truncate" title={folder}>{basename(folder)}</Menu.ItemText>
											</Menu.Item>
										{/each}
									{/if}
								</Menu.Content>
							</Menu.Positioner>
						</Portal>
					</Menu>
					<Menu.Separator class="border-surface-200-800 my-1 border-t" />
					<Menu.Item value="save" class={itemClass}>
						<Menu.ItemText>Save</Menu.ItemText><span class="opacity-50">{combo({}, 'S')}</span>
					</Menu.Item>
					{#if onCloseWorkspace}
						<Menu.Item value="close-workspace" class={itemClass}><Menu.ItemText>Close Workspace</Menu.ItemText></Menu.Item>
					{/if}
					<Menu.Separator class="border-surface-200-800 my-1 border-t" />
					<Menu.Item value="preferences" class={itemClass}><Menu.ItemText>Preferences…</Menu.ItemText></Menu.Item>
				</Menu.Content>
			</Menu.Positioner>
		</Portal>
	</Menu>

	<Menu onSelect={(d) => editSelect(d.value)}>
		<Menu.Trigger class={triggerClass} {disabled}>Edit</Menu.Trigger>
		<Portal>
			<Menu.Positioner>
				<Menu.Content class={contentClass}>
					<Menu.Item value="undo" class={itemClass}
						><Menu.ItemText>Undo</Menu.ItemText><span class="opacity-50">{combo({}, 'Z')}</span></Menu.Item
					>
					<Menu.Item value="redo" class={itemClass}
						><Menu.ItemText>Redo</Menu.ItemText><span class="opacity-50">{combo({ shift: true }, 'Z')}</span></Menu.Item
					>
					<Menu.Separator class="border-surface-200-800 my-1 border-t" />
					<Menu.Item value="find" class={itemClass}
						><Menu.ItemText>Find…</Menu.ItemText><span class="opacity-50">{combo({}, 'F')}</span></Menu.Item
					>
				</Menu.Content>
			</Menu.Positioner>
		</Portal>
	</Menu>

	<Menu onSelect={(d) => viewSelect(d.value)}>
		<Menu.Trigger class={triggerClass}>View</Menu.Trigger>
		<Portal>
			<Menu.Positioner>
				<Menu.Content class={contentClass}>
					<div class="text-surface-500 px-2.5 py-1 text-xs">Interface zoom: {uiZoomPercent}%</div>
					<Menu.Separator class="border-surface-200-800 my-1 border-t" />
					<Menu.Item value="zoom-in" class={itemClass}>
						<Menu.ItemText>Zoom In</Menu.ItemText><span class="opacity-50">{isMac ? '⌘ +' : 'Ctrl +'}</span>
					</Menu.Item>
					<Menu.Item value="zoom-out" class={itemClass}>
						<Menu.ItemText>Zoom Out</Menu.ItemText><span class="opacity-50">{isMac ? '⌘ −' : 'Ctrl −'}</span>
					</Menu.Item>
					<Menu.Item value="zoom-reset" class={itemClass}>
						<Menu.ItemText>Reset Zoom</Menu.ItemText><span class="opacity-50">{isMac ? '⌘ 0' : 'Ctrl 0'}</span>
					</Menu.Item>
				</Menu.Content>
			</Menu.Positioner>
		</Portal>
	</Menu>

	<Menu onSelect={(d) => void insertSelect(d.value)}>
		<Menu.Trigger
			class={triggerClass}
			disabled={disabled || $cursorInCm}
			title={$cursorInCm ? 'Move the cursor out of the raw / code / math block first' : ''}>Insert</Menu.Trigger
		>
		<Portal>
			<Menu.Positioner>
				<Menu.Content class={contentClass}>
					<Menu onSelect={(d) => mathSelect(d.value)}>
						<Menu.TriggerItem value="math" class={itemClass}>
							<Menu.ItemText>Math</Menu.ItemText><ChevronRight class="size-4 opacity-60" />
						</Menu.TriggerItem>
						<Portal>
							<Menu.Positioner>
								<Menu.Content class={contentClass}>
									<Menu.Item value="inline" class={itemClass}><Menu.ItemText>Inline equation</Menu.ItemText></Menu.Item>
									<Menu.Item value="display" class={itemClass}><Menu.ItemText>Display equation</Menu.ItemText></Menu.Item>
									<Menu.Separator class="border-surface-200-800 my-1 border-t" />
									<Menu.Item value="align" class={itemClass}><Menu.ItemText>Align</Menu.ItemText></Menu.Item>
									<Menu.Item value="aligned" class={itemClass}><Menu.ItemText>Aligned</Menu.ItemText></Menu.Item>
									<Menu.Item value="gather" class={itemClass}><Menu.ItemText>Gather</Menu.ItemText></Menu.Item>
									<Menu.Item value="cases" class={itemClass}><Menu.ItemText>Cases</Menu.ItemText></Menu.Item>
									<Menu.Item value="multline" class={itemClass}><Menu.ItemText>Multline</Menu.ItemText></Menu.Item>
									<Menu.Item value="split" class={itemClass}><Menu.ItemText>Split</Menu.ItemText></Menu.Item>
									<Menu.Separator class="border-surface-200-800 my-1 border-t" />
									<Menu.Item value="bmatrix" class={itemClass}><Menu.ItemText>Matrix [ ]</Menu.ItemText></Menu.Item>
									<Menu.Item value="pmatrix" class={itemClass}><Menu.ItemText>Matrix ( )</Menu.ItemText></Menu.Item>
								</Menu.Content>
							</Menu.Positioner>
						</Portal>
					</Menu>
					<Menu.Item value="image" class={itemClass}><Menu.ItemText>Image…</Menu.ItemText></Menu.Item>
					<Menu.Item value="table" class={itemClass}><Menu.ItemText>Table</Menu.ItemText></Menu.Item>
					<Menu.Item value="citation" class={itemClass}><Menu.ItemText>Citation</Menu.ItemText></Menu.Item>
					<Menu.Item value="link" class={itemClass}><Menu.ItemText>Link…</Menu.ItemText></Menu.Item>
					<Menu.Item value="code" class={itemClass}><Menu.ItemText>Code block</Menu.ItemText></Menu.Item>
					<Menu.Item value="hrule" class={itemClass}><Menu.ItemText>Horizontal rule</Menu.ItemText></Menu.Item>
					<Menu.Separator class="border-surface-200-800 my-1 border-t" />
					<Menu.Item value="environment" class={itemClass}><Menu.ItemText>Environment…</Menu.ItemText></Menu.Item>
					<Menu.Item value="rawlatex" class={itemClass}><Menu.ItemText>LaTeX Code</Menu.ItemText></Menu.Item>
					<Menu.Item value="inlinelatex" class={itemClass}><Menu.ItemText>Inline LaTeX</Menu.ItemText></Menu.Item>
				</Menu.Content>
			</Menu.Positioner>
		</Portal>
	</Menu>

	<Menu onSelect={(d) => (d.value === 'format-document' ? onFormatDocument?.() : formatSelect(d.value))}>
		<Menu.Trigger
			class={triggerClass}
			disabled={disabled || $cursorInCm}
			title={$cursorInCm ? 'Move the cursor out of the raw / code / math block first' : ''}>Format</Menu.Trigger
		>
		<Portal>
			<Menu.Positioner>
				<Menu.Content class={contentClass}>
					<Menu.Item value="bold" class={itemClass}
						><Menu.ItemText>Bold</Menu.ItemText><span class="opacity-50">{combo({}, 'B')}</span></Menu.Item
					>
					<Menu.Item value="italic" class={itemClass}
						><Menu.ItemText>Italic</Menu.ItemText><span class="opacity-50">{combo({}, 'I')}</span></Menu.Item
					>
					<Menu.Item value="underline" class={itemClass}
						><Menu.ItemText>Underline</Menu.ItemText><span class="opacity-50">{combo({}, 'U')}</span></Menu.Item
					>
					<Menu.Item value="code" class={itemClass}><Menu.ItemText>Inline code</Menu.ItemText></Menu.Item>
					<Menu.Separator class="border-surface-200-800 my-1 border-t" />
					<Menu.Item value="h1" class={itemClass}><Menu.ItemText>Heading 1</Menu.ItemText></Menu.Item>
					<Menu.Item value="h2" class={itemClass}><Menu.ItemText>Heading 2</Menu.ItemText></Menu.Item>
					<Menu.Item value="h3" class={itemClass}><Menu.ItemText>Heading 3</Menu.ItemText></Menu.Item>
					<Menu.Item value="quote" class={itemClass}><Menu.ItemText>Block quote</Menu.ItemText></Menu.Item>
					{#if onFormatDocument}
						<Menu.Separator class="border-surface-200-800 my-1 border-t" />
						<Menu.Item value="format-document" class={itemClass}><Menu.ItemText>Format document (latexindent)…</Menu.ItemText></Menu.Item>
					{/if}
				</Menu.Content>
			</Menu.Positioner>
		</Portal>
	</Menu>

	<Menu onSelect={(d) => spellcheckSelect(d.value)}>
		<Menu.Trigger class={triggerClass} {disabled}>Spelling</Menu.Trigger>
		<Portal>
			<Menu.Positioner>
				<Menu.Content class={contentClass}>
					<Menu.Item value="toggle" class={itemClass}>
						<Menu.ItemText>Check spelling &amp; grammar</Menu.ItemText>
						{#if spellcheckOn}<Check class="size-4" />{/if}
					</Menu.Item>
					<Menu.Separator class="border-surface-200-800 my-1 border-t" />
					<Menu.Item value="dictionary" class={itemClass}><Menu.ItemText>Edit dictionary…</Menu.ItemText></Menu.Item>
				</Menu.Content>
			</Menu.Positioner>
		</Portal>
	</Menu>

	{#if terminalAvailable}
		<Menu onSelect={(d) => terminalSelect(d.value)}>
			<Menu.Trigger class={triggerClass}>Terminal</Menu.Trigger>
			<Portal>
				<Menu.Positioner>
					<Menu.Content class={contentClass}>
						<Menu.Item value="compile" class={itemClass}><Menu.ItemText>Compile</Menu.ItemText></Menu.Item>
						<Menu.Item value="configure" class={itemClass}><Menu.ItemText>Configure compile command…</Menu.ItemText></Menu.Item>
						<Menu.Separator class="border-surface-200-800 my-1 border-t" />
						<Menu.Item value="new" class={itemClass}><Menu.ItemText>New terminal</Menu.ItemText></Menu.Item>
						<Menu.Item value="toggle" class={itemClass}>
							<Menu.ItemText>Show terminal</Menu.ItemText>
							{#if terminalVisible}<Check class="size-4" />{/if}
						</Menu.Item>
					</Menu.Content>
				</Menu.Positioner>
			</Portal>
		</Menu>
	{/if}

	<Menu onSelect={(d) => (d.value === 'tutorial' ? onOpenTutorial?.() : helpSelect(d.value))}>
		<Menu.Trigger class={triggerClass}>
			Help
			{#if $updateState.phase === 'downloaded'}
				<!-- an update finished downloading in the background; the menu item installs it -->
				<span class="bg-primary-500 mb-1.5 ml-0.5 inline-block size-1.5 rounded-full" title="Update ready"></span>
			{/if}
		</Menu.Trigger>
		<Portal>
			<Menu.Positioner>
				<Menu.Content class={contentClass}>
					<Menu.Item value="shortcuts" class={itemClass}><Menu.ItemText>Keyboard shortcuts</Menu.ItemText></Menu.Item>
					{#if onOpenTutorial}
						<Menu.Item value="tutorial" class={itemClass}><Menu.ItemText>Open Tutorial</Menu.ItemText></Menu.Item>
					{/if}
					<Menu.Separator class="border-surface-200-800 my-1 border-t" />
					<Menu.Item value="discord" class={itemClass}><Menu.ItemText>Join Discord</Menu.ItemText></Menu.Item>
					<Menu.Item value="support" class={itemClass}><Menu.ItemText>Contact support</Menu.ItemText></Menu.Item>
					<Menu.Separator class="border-surface-200-800 my-1 border-t" />
					<Menu.Item value="updates" class={itemClass}>
						<Menu.ItemText>Check for updates</Menu.ItemText>
						{#if $updateState.phase === 'downloaded'}
							<span class="bg-primary-500 inline-block size-1.5 rounded-full"></span>
						{/if}
					</Menu.Item>
					<div class="text-surface-500 px-2.5 py-1 text-xs">Texpile v{appVersion}</div>
				</Menu.Content>
			</Menu.Positioner>
		</Portal>
	</Menu>

	<input bind:this={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="hidden" onchange={onImagePicked} />
</nav>

<SpellcheckDictionary bind:open={dictionaryOpen} />
<PreferencesDialog bind:open={prefsOpen} />

<!-- text prompt dialog, Electron has no window.prompt() -->
{#if promptOpen}
	<div
		class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && closePrompt(false)}
	>
		<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-sm border p-4 shadow-2xl">
			<div class="mb-2 text-sm font-medium">{promptTitle}</div>
			<input
				bind:this={promptInput}
				bind:value={promptValue}
				class="input w-full"
				onkeydown={(e) => {
					if (e.key === 'Enter') closePrompt(true);
					else if (e.key === 'Escape') closePrompt(false);
				}}
			/>
			<div class="mt-4 flex justify-end gap-2">
				<button class="btn btn-sm hover:preset-tonal" type="button" onclick={() => closePrompt(false)}>Cancel</button>
				<button class="btn btn-sm preset-filled-primary-500" type="button" onclick={() => closePrompt(true)}>OK</button>
			</div>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && ((shortcutsOpen = false), (supportOpen = false))} />

{#if shortcutsOpen}
	<div
		class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && (shortcutsOpen = false)}
	>
		<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-5 shadow-2xl">
			<div class="mb-3 flex items-center justify-between gap-4">
				<h2 class="text-base font-semibold">Keyboard shortcuts</h2>
				<button class="btn-icon btn-icon-sm hover:preset-tonal" aria-label="Close" onclick={() => (shortcutsOpen = false)}
					><X class="size-4" /></button
				>
			</div>
			<div class="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
				{#each SHORTCUTS as grp (grp.group)}
					<div>
						<div class="text-surface-500 mb-1.5 text-xs font-semibold tracking-wider uppercase">{grp.group}</div>
						<ul class="space-y-1">
							{#each grp.items as s (s.label)}
								<li class="flex items-center justify-between gap-4 text-sm">
									<span>{s.label}</span>
									<kbd class="border-surface-300-700 bg-surface-100-900 rounded border px-1.5 py-0.5 font-mono text-xs whitespace-nowrap"
										>{s.keys}</kbd
									>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<!-- shows the email with a copy button, no mail client assumed -->
{#if supportOpen}
	<div
		class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && (supportOpen = false)}
	>
		<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-sm border p-5 shadow-2xl">
			<div class="mb-3 flex items-center justify-between gap-4">
				<h2 class="text-base font-semibold">Contact support</h2>
				<button class="btn-icon btn-icon-sm hover:preset-tonal" aria-label="Close" onclick={() => (supportOpen = false)}
					><X class="size-4" /></button
				>
			</div>
			<p class="text-surface-600-400 mb-2 text-sm">Email us and we'll get back to you:</p>
			<div class="border-surface-300-700 bg-surface-100-900 flex items-center justify-between gap-3 rounded border px-3 py-2">
				<code class="text-sm select-all">{SUPPORT_EMAIL}</code>
				<button class="btn btn-sm preset-tonal-primary shrink-0" onclick={copyEmail}>{copied ? 'Copied' : 'Copy'}</button>
			</div>
		</div>
	</div>
{/if}
