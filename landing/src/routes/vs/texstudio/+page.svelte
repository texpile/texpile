<script lang="ts">
	import VsPage from '$lib/comp/VsPage.svelte';
</script>

<VsPage
	vs={{
		name: 'TeXstudio',
		url: 'https://www.texstudio.org/',
		path: '/vs/texstudio',
		title: 'Texpile vs TeXstudio: a modern TeXstudio alternative',
		description:
			'Texpile and TeXstudio side by side: visual editing, start-up time, live preview, intellisense, collaboration, comments, git, and diffs. Both free.',
		lead: 'TeXstudio is the source editor many LaTeX writers learned on. Texpile is a newer desktop editor that adds a visual mode over the same .tex files. Both are free and open source, both run on Windows, macOS, and Linux, and both compile with the TeX distribution you already have.',
		pitch:
			'Texpile is a modern alternative to TeXstudio. If you love TeXstudio but wish for a modern interface with visual editing, an instant preview, and real-time collaboration, you should try Texpile.',
		rows: [
			{ label: 'Visual editing', texpile: 'Yes', other: 'No', better: 'texpile' },
			{ label: 'Start-up time', texpile: '236 ms', other: '1087 ms', better: 'texpile' },
			{ label: 'PDF viewer', texpile: 'Built in, supports SyncTeX', other: 'Built in, supports SyncTeX' },
			{
				label: 'Live preview',
				texpile: 'The page re-typesets as you type, with your own lualatex',
				other: 'Formulas and code segments inline; the PDF after a compile',
				better: 'texpile'
			},
			{
				label: 'Intellisense',
				texpile: 'Commands, environments, labels, citation keys, paths, your own macros, and 245 common packages',
				other: 'Completion word lists for a larger set of packages, including niche ones, and your own',
				better: 'other'
			},
			{
				label: 'Collaboration',
				texpile: 'Real time, end to end encrypted, no account',
				other: 'Since 4.9, through teamtype, on macOS and Linux',
				better: 'texpile'
			},
			{ label: 'Comments', texpile: 'Yes', other: 'No', better: 'texpile' },
			{
				label: 'Git support',
				texpile: 'Built in: a panel to save versions and restore them',
				other: 'Basic: check in and show old revisions, git or SVN',
				better: 'texpile'
			},
			{
				label: 'Diff viewer',
				texpile: 'A visual diff against the last version, word by word',
				other: 'Show difference: two or three files in the editor, changes highlighted'
			}
		],
		theirs:
			'TeXstudio is extremely customizable, with superior intellisense for source editing. If you make or use niche LaTeX packages and do not need a visual editor or a modern interface, TeXstudio is for you.',
		ours: "Texpile's flagship is the visual editor and the live preview. If you want your changes typeset instantly by lualatex, or prefer the LyX way of editing a LaTeX document while keeping plain .tex, you should use Texpile."
	}}
/>
