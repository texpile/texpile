<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, drawSelection, placeholder as cmPlaceholder, type KeyBinding } from '@codemirror/view';
	import { EditorState, Compartment, type Extension } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { tabIndentBinding } from '$lib/editor/source/extensions/keybindings/cmTabKey';
	import { foldGutter, indentOnInput, bracketMatching, foldKeymap } from '@codemirror/language';
	import { cmSyntaxHighlight } from '$lib/editor/source/cmHighlight';
	import { latexAutocomplete } from '$lib/languages/latex/intellisense/intellisense';
	import { bibtex } from '$lib/languages/bib/bibtexLanguage';
	import { languages } from '@codemirror/language-data';
	import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
	import { searchKeymap } from '@codemirror/search';

	type Props = {
		value: string;
		placeholder?: string;
		onValueChange?: (value: string) => void;
		readonly?: boolean;
		class?: string;
		language?: 'latex' | 'json' | 'markdown' | 'bibtex';
	};

	let {
		value = $bindable(),
		placeholder = '',
		onValueChange,
		readonly = false,
		class: className = '',
		language = 'latex'
	}: Props = $props();

	let editorElement: HTMLElement;
	let editorView: EditorView | null = null;
	let updating = false;

	const readOnlyCompartment = new Compartment();
	const languageCompartment = new Compartment();

	onMount(async () => {
		let languageExtension: Extension[] = [];
		try {
			if (language === 'bibtex') {
				// hand-written BibTeX StreamLanguage (same one source-mode CM uses for .bib files);
				// neither @codemirror/language-data nor legacy-modes ships a BibTeX mode
				languageExtension = [languageCompartment.of(bibtex())];
			} else if (language === 'json') {
				const jsonLanguage = languages.find((lang) => lang.name.toLowerCase().includes('json'));
				if (jsonLanguage) {
					const langSupport = await jsonLanguage.load();
					languageExtension = [languageCompartment.of(langSupport)];
				}
			} else if (language === 'markdown') {
				const markdownLanguage = languages.find((lang) => lang.name.toLowerCase().includes('markdown'));
				if (markdownLanguage) {
					const langSupport = await markdownLanguage.load();
					languageExtension = [languageCompartment.of(langSupport)];
				}
			} else {
				// the app's own LaTeX mode (same tags and colours as the source editor), not
				// language-data's stex, which paints commands in a tag the shared style ignores
				const { latex } = await import('$lib/languages/latex/source/latexLanguage');
				languageExtension = [languageCompartment.of(latex())];
			}
		} catch {
			console.warn(`${language} language support not available, using plain text`);
		}

		const customKeymap: KeyBinding[] = [];

		const scrollableTheme = EditorView.theme({
			'&': {
				height: '100%'
			},
			'.cm-scroller': {
				overflow: 'auto'
			}
		});

		const startState = EditorState.create({
			doc: value || '',
			extensions: [
				keymap.of([
					...customKeymap,
					...defaultKeymap,
					...historyKeymap,
					...foldKeymap,
					...closeBracketsKeymap,
					...searchKeymap,
					tabIndentBinding
				]),
				history(),
				drawSelection(),
				cmSyntaxHighlight(),
				// tooltipsInBody renders the autocomplete popup on document.body so it
				// escapes parent scroll/overflow containers
				...(language === 'latex' ? [latexAutocomplete({ tooltipsInBody: true })] : []),
				indentOnInput(),
				bracketMatching(),
				closeBrackets(),

				...(language === 'json' || language === 'markdown' ? [foldGutter()] : []),

				EditorView.lineWrapping,

				scrollableTheme,

				readOnlyCompartment.of(EditorState.readOnly.of(readonly)),
				EditorView.updateListener.of((update) => {
					if (update.docChanged && !updating) {
						const newValue = update.state.doc.toString();
						value = newValue;
						onValueChange?.(newValue);
					}
				}),
				...languageExtension,
				placeholder ? cmPlaceholder(placeholder) : []
			].filter(Boolean)
		});

		editorView = new EditorView({
			state: startState,
			parent: editorElement
		});
	});

	onDestroy(() => {
		editorView?.destroy();
	});

	// sync external value changes into the editor
	$effect(() => {
		// read value so the effect tracks it
		const newValue = value;

		if (editorView && !updating) {
			const currentValue = editorView.state.doc.toString();
			if ((newValue || '') !== currentValue) {
				updating = true;
				editorView.dispatch({
					changes: {
						from: 0,
						to: currentValue.length,
						insert: newValue || ''
					}
				});
				// small delay to prevent update loops
				setTimeout(() => {
					updating = false;
				}, 10);
			}
		}
	});

	$effect(() => {
		if (editorView) {
			editorView.dispatch({
				effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readonly))
			});
		}
	});
</script>

<div
	bind:this={editorElement}
	class="codemirror-wrapper {className}"
	role="textbox"
	aria-label="{language.charAt(0).toUpperCase() + language.slice(1)} Code Editor"
></div>

<style>
	.codemirror-wrapper {
		width: 100%;
		height: 100%;
	}
</style>
