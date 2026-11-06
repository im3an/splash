# Accessibility audit of the shell

Measured 6 November 2026 in the running app, against WCAG 2.1 AA. Real VoiceOver
was not used: it speaks aloud and takes over the Mac, so that walkthrough still
needs a person (see the end).

## Short version

The foundation is good. Every control has a name, the roles are right, focus is
visible, and text passes on every theme. The one real problem was the command
palette's glass letting the page behind it wash out its secondary text, now fixed.

## What was measured

- **Accessibility tree** (Chromium's full tree over CDP): the shell, the palette,
  History, Downloads, the workspace editor and all ten Settings sections.
- **Focus order**: real Tab presses through the shell and Settings.
- **Text and icon contrast**: computed for the shell states and Settings, in light
  and dark. Text is 4.5:1 (3:1 when large) and icons are 3:1.
- **Themes, from real pixels**: 114 combinations of theme, light or dark, and
  intensity (default and 100%). The presets, plus hard custom colours such as white,
  pale yellow, cyan and black. Each ratio is the 5th-percentile pixel behind the text.
- **Plain frames**: all eight accents and six custom ones, in light and dark.
- **The palette over a real white and a real black page**, from real pixels.

The palette, spelling, Dock and Now Playing results are from Electron 45.2.3. The
tree, focus order and theme sweep ran on 45.0.0, just before the upgrade landed;
they measure the shell's own markup and CSS, which the upgrade didn't change, but
they were not repeated.

## Fixed in this pass

| What                                                                                                                                | Before           | After                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| Tab stops in the sidebar: every page row's Actions button was a stop, so 100 pages meant 100 presses to get past the tree           | One stop per row | One stop for the current row and its actions, like the row itself |
| Selected palette row's detail line stayed `fg-subtle` while its icon and shortcut brightened (worst text over a black page in dark) | 4.78:1           | 5.84:1, matching its siblings                                     |

## Decided: palette panel at 92%

The palette's panel was 70% opaque in dark and 74% in light, so a page of the
opposite brightness showed through and washed out its secondary text. Dark mode over
a white page is the everyday case. The panel is now 92% in both modes: it keeps its
tint and shadow, but the page barely shows through. Worst text in the palette, from
real pixels, with the selected-row fix above:

| Page behind | Mode  | Before   | At 92% |
| ----------- | ----- | -------- | ------ |
| White       | Dark  | **3.13** | 4.58   |
| Black       | Light | **3.38** | 5.32   |
| Black       | Dark  | 5.84     | 5.38   |
| White       | Light | 5.77     | 6.19   |

Also measured and rejected: an 85% panel with all secondary text in `fg-muted` (4.13
in dark), and a darker scrim with the same text (4.00 in dark, 3.73 in light, where a
scrim can't help a light panel over a black page).

## Decided: solid switch tracks

WCAG asks for 3:1 where a control's edge or state is needed to read it (1.4.11). The
off track was nearly invisible on its card, and in dark the light knob washed out on
the on track. The off track is now a solid tint, and the knob takes `--on-accent` when
on, so in dark it turns from light to dark as it slides.

Measured from real pixels in Settings on Electron 45.2.3. "Before" is the default look,
and "After" is the worst of 152 looks: all six frames with all eight accents, 17 preset
themes and 11 hard custom colours, in light and dark. The knob's shadow wasn't counted.

| Switch | Against   | Before, light | Before, dark | After, light | After, dark |
| ------ | --------- | ------------- | ------------ | ------------ | ----------- |
| Off    | Its card  | **1.20**      | **1.28**     | 3.05         | 3.11        |
| Off    | Its track | **1.20**      | 10.26        | 3.05         | 3.88        |
| On     | Its card  | not measured  | not measured | 4.66         | 5.68        |
| On     | Its track | 4.95          | **2.15**     | 4.66         | 7.00        |

The margin on the off state is thin, at 3.05 on the Sage frame in light and 3.07 on
the default, so a new frame preset should be checked against it.

## Decided: dark secondary text at `#a89c8f`

Settings' `example.com` placeholder sits on a field, the lightest surface it meets. The
user chose to lift dark `--fg-subtle` from `#a09588` to `#a89c8f`, which lifts all
secondary text in dark slightly and brings it a little closer to `fg-muted`, from 1.26:1
between them to 1.15:1. The other numbers in this audit were measured before the lift,
which can only raise them in dark.

Placeholder on its field in dark, Electron 45.2.3. "Now" is measured from real pixels,
and "Before" is calculated from the same field colours:

| Frame | Before | Now  |
| ----- | ------ | ---- |
| Paper | 4.44   | 4.85 |
| Lilac | 4.38   | 4.79 |
| Stone | 4.28   | 4.68 |
| Blush | 4.27   | 4.67 |
| Mist  | 4.15   | 4.54 |
| Sage  | 4.15   | 4.53 |

Paper is the default. `#a5998c` was tried first, but Sage and Mist have lighter fields
and stayed at 4.37, so this is the smallest lift found that passes on all six. The margin
there is thin, so a new frame preset should be checked against it. In light, the worst
placeholder is 5.27:1. The placeholders in forms that open on demand, such as adding a
search shortcut, weren't measured separately.

## Lower priority

- **Fields and selects** are 1.13–1.16:1 against their card. Their text and chevron
  identify them, so this is a common and defensible choice.
- **The chosen segment** read 1.13–1.16:1, but this measured the button rather than
  its sliding indicator, so it needs a proper look before it counts as a finding.
- **A single miss on the theme sweep:** "Not secure" at 11px, 4.45:1, with a custom
  cyan at 100% intensity in dark.
- **"Reduce transparency" and "Increase contrast"** in macOS weren't honoured. Now
  they are, checked by emulating them: see the to-do for what each changes.
- **No key moves focus from the shell to the page** without navigating. ⌘L reaches
  the shell from a page and isn't a trap, but Chrome's F6 pane cycling would help.

## What passed

- **Names:** no unnamed button, link, field or switch on any surface.
- **Roles:** the tree has levels, selection and expansion, with roving focus. Toggles
  are switches. The palette and panels are dialogs, permission and unresponsive bars
  are alert dialogs, and results and errors are status and alert regions.
- **Landmarks:** sidebar, main, navigation and search. Settings marks its current
  section with `aria-current`.
- **Focus:** a solid 2px accent ring on every stop checked, including the address
  field and row actions, which appear when focused. The ring is at least 4.02:1
  against the frame on every theme.
- **Order:** sidebar top, tree, footer, resize handle, then the toolbar, matching the
  layout from left to right. Settings runs from the sections to the content.
- **Text on every preset theme, and on custom colours:** all pass but the one miss
  above. Light accents reach 4.60:1 or better with white text, and custom accents are
  clamped. This replaces the "3.3–6.7:1, not contrast-checked" note in
  `product-review.md`.
- **Disabled controls** are exempt from WCAG contrast and were left out. A disabled
  Back reads about 1.3:1, and that's the intent.

## Still needs a person

- **VoiceOver walkthrough:** does each control read sensibly in order; moving between
  shell and page; rows announced with level and "page"; the Actions button inside a
  tree row (nested controls in a tree can be hard for VoiceOver to reach); bars and
  toasts announced without losing your place.
- **Physical media keys, a click in Control Center, a real click in the Dock.**
- **macOS's own AirPlay** with a receiver.

Tree and contrast checks can't prove what VoiceOver says, so passing here doesn't
replace that test.
