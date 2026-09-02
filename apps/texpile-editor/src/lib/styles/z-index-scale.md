# Z-Index Scale for Texpile Editor

This document defines the z-index layering system used throughout the application to prevent stacking context conflicts.

## Tailwind Utilities

Custom z-index utilities are defined in `app.css` using `@utility` directive (Tailwind v4). Use these semantic class names instead of arbitrary values:

```html
<!-- ✅ Good: Semantic utility classes -->
<div class="z-dialog">...</div>
<div class="z-sticky-header">...</div>

<!-- ❌ Avoid: Arbitrary values -->
<div class="z-[1000]">...</div>
```

**Implementation**: CSS variables are defined in `@theme` (e.g., `--z-index-dialog: 1000`), then utility classes are created with `@utility z-dialog { z-index: var(--z-index-dialog); }`.

## Scale (lowest to highest)

| Layer                  | z-index   | Usage                               | Components                                            |
| ---------------------- | --------- | ----------------------------------- | ----------------------------------------------------- |
| **Base Content**       | 0-9       | Default document flow               | Most content                                          |
| **Elevated Content**   | 10-19     | Sticky elements, dropdowns          | Sidebar (z-40 legacy)                                 |
| **Sticky Headers**     | 100-109   | Fixed headers and toolbars          | `z-sticky-header` (100), `z-header` (101)             |
| **Floating UI**        | 200-299   | Search bars, popovers, dropdowns    | `z-floating-ui`, `z-search` (200), `z-dropdown` (210) |
| **Modals/Dialogs**     | 1000-1099 | Standard modals and dialogs         | `z-dialog`, `z-modal` (1000)                          |
| **Critical Overlays**  | 1100-1199 | Banners, important notifications    | `z-banner`, `z-overlay-critical` (1100)               |
| **Special Modals**     | 2000-2099 | Template picker, special overlays   | `z-special-modal`, `z-template-picker` (2000)         |
| **Full-Screen Modals** | 3000-3099 | PDF viewer, full-screen experiences | `z-fullscreen-modal`, `z-pdf-viewer` (3000)           |
| **Hover hints**        | 4000      | The one tooltip, above every layer  | `z-tooltip` (4000)                                    |

## Usage Guidelines

1. **Always use semantic utility classes** - e.g., `z-dialog` instead of `z-[1000]`
2. **Defined in app.css** - CSS variables in `@theme`, utility classes with `@utility`
3. **Update this document** - When adding new layers or components
4. **To add new z-index utilities**:

   ```css
   /* In app.css */
   @theme {
   	--z-index-my-layer: 500;
   }

   @utility z-my-layer {
   	z-index: var(--z-index-my-layer);
   }
   ```

5. **Update this document** - When adding new layers or components
6. **Use CSS custom properties** - Consider moving to CSS variables in app.css for maintainability

## Current Assignments

### Sticky Headers (100-109)

- `Header.svelte`: z-[101]
- `MobileActionBar.svelte`: z-[100]
- `TemplateEditHeader.svelte`: z-[100]

### Floating UI (200-299)

- `SearchBar.svelte`: z-[200]
- Dropdowns/Popovers: z-[210]

### Modals/Dialogs (1000-1099)

- All `Dialog` components: z-[1000]
  - Backdrop: z-[1000]
  - Positioner: z-[1000]
  - Content: inherits from Positioner

### Critical Overlays (1100-1199)

- `BannerManager.svelte` (top): z-[1100]
- `BannerManager.svelte` (bottom): z-[1100]

### Special Modals (2000-2099)

- `TemplatePicker.svelte`: z-[2000] (backdrop), z-[2001] (content)

### Full-Screen Modals (3000-3099)

- `PdfViewerModal.svelte`: z-[3000] (backdrop), z-[3001] (content)

### Hover hints (4000)

- `TooltipHost.svelte`: z-[4000]. The whole app has one tooltip, and it has to clear modals and
  the PDF viewer because controls inside those have hints too.

## Migration Notes

When migrating from old z-index values:

- z-40 (sidebar/mobile) → z-[100] (sticky headers)
- z-[100] (old dialogs) → z-[1000] (modals layer)
- z-[150] (searchbar) → z-[200] (floating UI)
- z-[1000] (template picker) → z-[2000] (special modals)
- z-[2000] (pdf viewer) → z-[3000] (full-screen modals)
