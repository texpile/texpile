---
description: Pick a light or dark mode and one of 25 color themes for Texpile, write your own theme in CSS, and turn on a transparent window, from Preferences › Appearance.
blurb: Light or dark mode, 25 color themes, your own CSS themes, and a transparent window.
icon: palette
order: 35
section: Customize
---

# Themes

Preferences › Appearance has 25 color themes, each in light and dark.

![The Appearance tab in dark mode with the Dracula theme chosen, showing the Mode choice and the Theme grid](../landing/src/lib/assets/showcase/docs/app/preferences-appearance-dark.png)

**Transparent window** blurs the desktop behind Texpile. Windows 11 and macOS only.

## Custom themes

A custom theme is a CSS file in the themes folder. Preferences › Appearance › Open Themes Folder opens it. Each `.css` file in the folder shows as a tile under Custom themes, named after the file: `night-owl.css` shows as Night Owl. Texpile applies a saved change right away.

A custom theme builds on the Texpile theme and can hold any CSS. One theme covers both modes, and rules under `[data-mode='dark']` apply in dark mode only.

Fonts and images go in a folder named after the theme. The CSS loads them with a relative `url()`.

```
themes/
  night-owl.css
  night-owl/
    paper.jpg
    stix.woff2
```

```css
:root {
	--color-primary-500: #82aaff;
	--syntax-keyword: #c792ea;
}

[data-mode='dark'] {
	--color-surface-950: #011627;
}

body {
	background-image: url(night-owl/paper.jpg);
}
```

A theme loads files from the themes folder only. Texpile does not load anything from the web.

To install a theme, copy its `.css` file and its folder into the themes folder. To share one, send both.

### Variables

The variables stay the same from one version of Texpile to the next. Class names can change.

A theme can set one shade of a family, such as `--color-primary-500`. Texpile blends the family's other shades from the ones the theme sets, and gives each shade black or white text to match. This theme recolors the whole window:

```css
:root {
	--color-primary-500: #82aaff;
	--color-surface-950: #011627;
}
```

| Variables                                                                      | What they color                                                                     |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `--color-primary-50` to `--color-primary-950`                                  | Buttons, links and other accents. 500 is the main shade.                            |
| `--color-secondary-*`, `--color-tertiary-*`                                    | The second and third accents.                                                       |
| `--color-success-*`, `--color-warning-*`, `--color-error-*`                    | Messages, problems and changes.                                                     |
| `--color-surface-50` to `--color-surface-950`                                  | The ground, panels and text. Light mode uses the low shades and dark mode the high. |
| `--syntax-comment`, `--syntax-keyword`, `--syntax-command`, `--syntax-string`… | Source editor highlighting.                                                         |
| `--find-match-bg`, `--find-match-active-bg`                                    | Find matches.                                                                       |
| `--proof-spelling`, `--proof-style`…                                           | Spelling and grammar underlines.                                                    |
| `--typo-base--font-family`, `--typo-heading--font-family`                      | The interface and heading fonts.                                                    |
| `--radius-base`, `--radius-container`                                          | Corners of buttons and of panels.                                                   |

### When a theme hides the window

Command palette › Use Default Theme switches back to the Texpile theme. Deleting the theme's file does the same.
