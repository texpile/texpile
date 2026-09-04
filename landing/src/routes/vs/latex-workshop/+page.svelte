<script lang="ts">
	import VsPage from '$lib/comp/VsPage.svelte';
</script>

<VsPage
	vs={{
		name: 'LaTeX Workshop',
		url: 'https://github.com/James-Yu/LaTeX-Workshop',
		path: '/vs/latex-workshop',
		title: 'Texpile vs LaTeX Workshop: editor or VS Code extension',
		description:
			'Texpile and the LaTeX Workshop extension for VS Code side by side: visual editing, live preview, intellisense, collaboration, comments, git, and start-up time.',
		lead: 'LaTeX Workshop turns VS Code into a LaTeX editor: build on save, a PDF viewer with SyncTeX, and completion. Texpile is a dedicated editor for LaTeX with a visual mode and a live preview built in.',
		pitch:
			'Texpile is a dedicated alternative to LaTeX Workshop. If you like VS Code but want to see the page while you write, review with comments and a visual diff, and collaborate without a sign-in, you should try Texpile. It also starts faster: 236 ms to the window, against 373 ms for VS Code before a single extension has loaded.',
		rows: [
			{ label: 'Visual editing', texpile: 'Yes, on the .tex file itself', other: 'No', better: 'texpile' },
			{ label: 'Start-up time', texpile: '236 ms', other: '373 ms for VS Code itself, before LaTeX Workshop loads', better: 'texpile' },
			{ label: 'PDF viewer', texpile: 'Built in, supports SyncTeX', other: 'Built in, supports SyncTeX' },
			{
				label: 'Live preview',
				texpile: 'The page re-typesets as you type',
				other: 'The PDF after a build, which can run on save',
				better: 'texpile'
			},
			{
				label: 'Intellisense',
				texpile: 'Derived from LaTeX Workshop, with the same 245 packages and the same completions, plus improvements in places',
				other: 'Citations, references, commands, environments, and packages, with snippets'
			},
			{
				label: 'Collaboration',
				texpile: 'Real time, end to end encrypted, no account',
				other: 'With the Live Share extension, Microsoft or GitHub sign-in',
				better: 'texpile'
			},
			{ label: 'Comments', texpile: 'Yes', other: 'No', better: 'texpile' },
			{
				label: 'Git support',
				texpile: 'Built in: save versions, restore',
				other: "VS Code's own git, with every extension for it",
				better: 'other'
			},
			{ label: 'Diff viewer', texpile: 'A visual diff against the last version, word by word', other: "VS Code's source diff" }
		],
		sections: [
			{
				heading: 'Intellisense',
				body: "Texpile's intellisense is derived from LaTeX Workshop's and improved in some cases, so the two mostly share the same capabilities: commands, environments, labels, citation keys, paths, and the keys of common packages. Texpile adds a static parse of the whole project, so macros defined in another file complete too."
			}
		],
		theirs:
			'LaTeX Workshop brings everything VS Code has: the extension ecosystem, remote and container workflows, git as you already use it, and settings you have tuned for years. If VS Code is where your day happens and you write LaTeX in source, LaTeX Workshop is for you.',
		ours: "Texpile's flagship is the visual editor and the live preview. If you want your changes typeset instantly by lualatex, prefer editing the document over editing the markup, or review with co-authors who will never install VS Code, you should use Texpile."
	}}
/>
