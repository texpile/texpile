<script lang="ts">
	import VsPage from '$lib/comp/VsPage.svelte';
</script>

<VsPage
	vs={{
		name: 'LyX',
		url: 'https://www.lyx.org/',
		path: '/vs/lyx',
		title: 'Texpile vs LyX: a modern LyX alternative on plain .tex',
		description:
			'Texpile and LyX side by side: both edit the document rather than the markup, but Texpile works on plain .tex with a live preview, comments, and collaboration.',
		lead: 'LyX pioneered writing LaTeX documents by their structure rather than their markup, with an integrated equation editor and LaTeX generated for you. It keeps documents in its own .lyx format. Texpile takes the same idea to plain .tex files: the visual editor edits your LaTeX source directly and saves it back with only your edits changed.',
		pitch:
			'Texpile is a modern alternative to LyX. If you like the LyX way of writing but want to stay in .tex, see the typeset page as you type, and review or write with other people, you should try Texpile.',
		rows: [
			{ label: 'Visual editing', texpile: 'Yes, on the .tex file itself', other: 'Yes, structure-based (WYSIWYM), on a .lyx file' },
			{
				label: 'File format',
				texpile: 'Plain .tex, the same file your co-authors and journals use',
				other: '.lyx, with LaTeX exported and imported',
				better: 'texpile'
			},
			{
				label: 'Source editing',
				texpile: 'A full source editor with intellisense, in the same file',
				other: 'A read-only source view',
				better: 'texpile'
			},
			{
				label: 'Live preview',
				texpile: 'The page re-typesets as you type, with your own lualatex',
				other: 'Math and graphics preview inline; the PDF after an export',
				better: 'texpile'
			},
			{ label: 'PDF viewer', texpile: 'Built in, with SyncTeX both ways', other: 'An external viewer, with forward and reverse search' },
			{ label: 'Equations', texpile: 'A visual math editor and a source view', other: 'An integrated equation editor' },
			{ label: 'Collaboration', texpile: 'Real time, end to end encrypted, no account', other: 'No', better: 'texpile' },
			{ label: 'Comments', texpile: 'Threads on the text, with replies and resolve', other: 'Notes in the document' },
			{ label: 'Git support', texpile: 'Built in: save versions, restore', other: 'Version control menu for git, SVN, and others' },
			{ label: 'Diff viewer', texpile: 'A visual diff against the last version, word by word', other: 'Document compare' }
		],
		theirs:
			'LyX is mature and stable, its equation editor is excellent, and its structure-first model is fully worked out after decades of use. If you write alone, never need to hand a .tex file to anyone, and want a document processor rather than an editor, LyX is for you.',
		ours: "Texpile's flagship is the visual editor and the live preview. If you want the LyX way of editing but on the .tex file itself, with your changes typeset instantly by lualatex, and with comments and real-time collaboration for the people you write with, you should use Texpile."
	}}
/>
