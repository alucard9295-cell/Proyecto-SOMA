---
name: Tectonic Editorial
colors:
  surface: '#f9f9f7'
  surface-dim: '#dadad8'
  surface-bright: '#f9f9f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4f2'
  surface-container: '#eeeeec'
  surface-container-high: '#e8e8e6'
  surface-container-highest: '#e2e3e1'
  on-surface: '#1a1c1b'
  on-surface-variant: '#43474b'
  inverse-surface: '#2f3130'
  inverse-on-surface: '#f1f1ef'
  outline: '#74777c'
  outline-variant: '#c4c7cc'
  surface-tint: '#52606d'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#0f1d28'
  on-primary-container: '#778593'
  inverse-primary: '#bac8d7'
  secondary: '#506070'
  on-secondary: '#ffffff'
  secondary-container: '#d3e4f7'
  on-secondary-container: '#566676'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#001e2b'
  on-tertiary-container: '#008eba'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e4f4'
  primary-fixed-dim: '#bac8d7'
  on-primary-fixed: '#0f1d28'
  on-primary-fixed-variant: '#3b4855'
  secondary-fixed: '#d3e4f7'
  secondary-fixed-dim: '#b7c8da'
  on-secondary-fixed: '#0c1d2a'
  on-secondary-fixed-variant: '#384857'
  tertiary-fixed: '#c0e8ff'
  tertiary-fixed-dim: '#71d2ff'
  on-tertiary-fixed: '#001e2b'
  on-tertiary-fixed-variant: '#004d66'
  background: '#f9f9f7'
  on-background: '#1a1c1b'
  surface-variant: '#e2e3e1'
typography:
  display-xl:
    fontFamily: Jost
    fontSize: 72px
    fontWeight: '700'
    lineHeight: 80px
    letterSpacing: -0.02em
  display-xl-mobile:
    fontFamily: Jost
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Jost
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Jost
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Jost
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
  headline-md-mobile:
    fontFamily: Jost
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  headline-sm:
    fontFamily: Jost
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: DM Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: DM Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: DM Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: DM Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.18em
  caption:
    fontFamily: DM Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.02em
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 4rem
  margin-mobile: 1.25rem
  space-xs: 0.5rem
  space-sm: 1rem
  space-md: 2rem
  space-lg: 4rem
  space-xl: 7rem
---

## Brand & Style

This design system embodies an uncompromising architectural ethos: structural discipline, expansive negative space, and meticulous material balance. Designed for high-end monograph portfolios, the aesthetic translates physical built environments into a digital medium through rigorous proportions, full-bleed imagery, and museum-grade typographic composure.

The visual narrative bridges deliberate minimalism and high-contrast editorial publishing. The interface steps back, operating as an unobtrusive scaffold that foregrounds structural photography, technical orthographic drawings, and spatial narratives. The emotional response is one of permanence, precision, and quiet authority.

## Colors

The palette derives from physical building materials: unpolished bone limestone, patinated marine navy, slate, and precision drafting ink.

- **Primary (`#0D1B26`)**: Deep structural navy. Serves as the primary ink for typography on light backgrounds and the base fill for inverted, high-drama project showcase sections.
- **Secondary (`#3D4D5C`)**: Muted slate. Reserved for secondary copy, meta specifications, and structural subtitles.
- **Tertiary (`#29B2E5`)**: Crisp cyan drafting accent. Used sparingly for interactive focal points, active category indicators, technical drawing highlights, and key indices.
- **Neutral (`#F4F4F2`)**: Off-white bone canvas. Softens reading fatigue while sustaining daylight contrast without harsh pure-white glare.
- **Captions & Orthographic Subtext (`#8A9EAD`)**: Low-contrast architectural annotations, drawing scales, and photo credits.
- **Hairlines**: Strict 1px division rules. Light mode utilizes `#E2E2DF`; dark inverted canvases utilize `rgba(255, 255, 255, 0.12)`.

## Typography

The typographic system creates an interplay between geometric discipline and editorial grace:

- **Editorial Dual-Treatment (Jost)**: Major headings employ a deliberate pairing pattern—anchor nouns set in bold (`font-weight: 700`), followed immediately by descriptors set in light italic (`font-weight: 300; font-style: italic`). This contrasts monolithic presence with delicate draftsmanship.
- **Body Text (DM Sans)**: Neutral, highly legible humanist-geometric body text engineered for prolonged architectural essays and site descriptions.
- **Labels & Metadata**: Set strictly in `label-caps`—all-caps, tracking-widest (`letter-spacing: 0.18em`), establishing visual anchors for project metadata such as coordinates, typologies, and completion years.

## Layout & Spacing

The layout is built upon an asymmetric 12-column architectural grid with generous margins that act as gallery mats.

- **Desktop (1200px+)**: 12 columns with 1.5rem (`24px`) gutters and an expansive 4rem (`64px`) page margin. Major hero sections and project spreads deliberately break margins to span the viewport edge-to-edge.
- **Tablet (768px - 1199px)**: 8 columns with 1.5rem gutters and 2.5rem margins. Asymmetrical offsets compress into balanced 4-column pairing modules.
- **Mobile (< 768px)**: 4 columns with 1rem gutters and 1.25rem margins. Multi-column editorial metadata stacks into structured single-column lists separated by hairlines.
- **Vertical Rhythm**: Massive empty spaces (`space-xl`) flank transitions between spatial essays, allowing each project room to breathe independently.

## Elevation & Depth

This system rejects faux-physical depth, skeuomorphic extrusion, and soft drop shadows entirely. The physical world is referenced through surface materiality, not synthetic lighting.

- **Low-Contrast Hairlines**: Spatial separation is achieved exclusively through 1px hairline rules (`#E2E2DF` on light bone, `rgba(255, 255, 255, 0.12)` on dark navy).
- **Tonal Sectioning**: Depth transitions are horizontal and architectural—moving down a page shifts from the off-white bone (`#F4F4F2`) gallery level down to the deep navy (`#0D1B26`) subterranean archive.
- **Overlay Panels**: Floating drawers, technical index flyouts, and image lightboxes use solid `#0D1B26` with a crisp 1px border of `#29B2E5` or `#3D4D5C`, without drop shadows or blur filters.

## Shapes

The geometry of the interface is unyielding:

- **Strict 0px Corners**: Every surface, button, tag, modal, card, and image frame possesses pure right angles (`border-radius: 0px`).
- **Aspect Ratios**: Imagery adheres to rigorous architectural ratios: 1:1 for detail studies, 4:3 for structural sections, 16:9 for site contexts, and 21:9 for landscape panoramic vistas.

## Components

### Buttons
- **Primary Action**: Solid `#0D1B26` fill, `#F4F4F2` DM Sans bold all-caps text (`11px`, `0.18em` tracking), 0px radius, padding `1rem 2rem`. On hover, background shifts instantly (no ease lag) to `#29B2E5` with `#0D1B26` text.
- **Outline / Secondary**: 1px border of `#0D1B26`, transparent fill, text in `#0D1B26`. On hover, inverts to solid `#0D1B26` fill with bone text.
- **Dark Mode Variant**: 1px border of `rgba(255,255,255,0.2)` with white text; on hover shifts to `#29B2E5` border and text.

### Chips & Meta Tags
- Compact, sharp rectangles with no radius.
- Background: transparent with a 1px hairline border of `#3D4D5C`.
- Text: `label-caps` in `#3D4D5C`.
- Active/Selected state: border color and text switch to cyan `#29B2E5`, with an optional leading 4px square indicator block.

### Project Cards
- Monolithic full-bleed image container with zero corner radius.
- Metadata strip pinned below or overlaid at the bottom: project serial number (e.g., `REF. 042`) in cyan `#29B2E5`, title in Jost bold, and year/typology in muted `#8A9EAD`.
- Interactive state: subtle 1.02x image scale contained within a hard-clipped overflow container, accompanied by a 1px border accent shift.

### Lists & Index Views
- Monograph table layout separated by 1px hairlines.
- Columns: Index (cyan), Project Name (Jost bold + light italic), Location (slate), Typology (slate), and Year (muted).
- Hover state: Entire row highlights with a subtle tint of `#E2E2DF` (or `rgba(255,255,255,0.04)` in dark sections).

### Inputs & Form Fields
- Minimalist baseline style: 1px bottom border in `#3D4D5C` with transparent fill and no side/top borders.
- Floating label in `label-caps` typography (`#8A9EAD`).
- Focus state: bottom border shifts to `#29B2E5` with 0px outline.

### Checkboxes & Radios
- Sharp 14px square boxes (0px radius) with a 1px `#3D4D5C` frame.
- Check state: solid `#0D1B26` box filled with an interior 6px solid cyan (`#29B2E5`) square.
- Radio buttons maintain the same square-within-square motif to reinforce the anti-curvilinear architectural geometry.

### Technical Spec Drawer
- Monospaced or tabular metadata panel displaying floor area, materials, and structural engineering partners.
- Divided into strict technical grids using hairlines, referencing traditional architectural title blocks.