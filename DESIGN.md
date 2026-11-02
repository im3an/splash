# Splash design system

## Direction

Compact macOS browser chrome surrounds a rounded page surface. The sidebar is the primary navigation: workspace heading, New page, hierarchical trail and workspace controls at the foot. Preserve this composition and its quiet, personal feel.

## Color and surfaces

Source: src/renderer/styles/tokens.css, src/shared/appearance.ts and src/renderer/hooks/use-workspace-theme.ts. Warm charcoal dark is the default: #1a1714 chrome, #201c18 page surface, #2a2520 elevated panels, with a warm off-white ink (240 228 214) for hovers, lines and tints instead of pure white. Paper light uses #f3efe9 chrome, #faf8f5 surfaces and #ffffff elevated. Workspaces choose an accent and a frame preset; the frame takes a 5–6% tint of the accent. Use fg, fg-muted and fg-subtle by role; status colours are danger, success, warning and info; borders are border and border-hover; focus uses focus-ring. Primary actions are accent with on-accent text. Keep the light, dark and frame overrides in step.

Contrast, measured from the token values (WCAG ratio, small text needs 4.5):

| Text      | Dark chrome | Dark surface | Dark elevated | Light chrome | Light surface | Light elevated |
| --------- | ----------- | ------------ | ------------- | ------------ | ------------- | -------------- |
| fg        | 14.4        | 13.7         | 12.3          | 14.6         | 15.8          | 16.7           |
| fg-muted  | 7.6         | 7.2          | 6.5           | 6.9          | 7.5           | 7.9            |
| fg-subtle | 6.1         | 5.8          | 5.2           | 5.5          | 6.0           | 6.3            |
| danger    | 6.4         | 6.1          | 5.5           | 5.3          | 5.7           | 6.0            |
| accent    | 7.2         | 6.8          | 6.1           | 4.3          | 4.7           | 4.9            |

Accent colours icons, monograms and on-states, always beside a text label, so the 3:1 non-text threshold applies. Every preset passes it on every tinted frame (light 3.3–6.7, dark 6.6–9.2). Light accents are too light for small text: never set body or label text in accent. Custom accents from the colour wheel aren't checked.

Websites follow the theme: the scheme is set through macOS (nativeTheme), which sets prefers-color-scheme for pages, as Safari does.

## Typography and density

System UI font stack (SF Pro on macOS). Caption 11px, small 12px, body 13px, lead 14px, title 15px, display 20px. Use weight and spacing for hierarchy, without oversized headings in browser controls. Rows are 34px comfortable or 28px compact; toolbar 48px; sidebar 260px, expanded panels 380px.

## Shape and layout

Radii: mark 3px, inner 5px, row 6px, control 7px, pill/content 10px. Window gutter 8px. Controls typically use a 28px height and icons at 14–16px. Use existing icon-button and button classes. Keep contextual menus within the sidebar because Chromium page views paint above shell overlays. Icon-only controls carry an accessible name and a native tooltip (title) naming the action and its shortcut; native tooltips draw above page views, which a shell tooltip can't.

## Interaction vocabulary

Native buttons, switches and segmented choices. Share segmented controls between workspace customization and settings. Inactive controls stay quiet; selected controls have a clear surface or mark; keyboard focus remains visible. Primary actions are reserved for the next meaningful step. Use page, trail, branch and workspace consistently.

## Panels and states

History and Downloads share header placement and empty-state hierarchy. Loading must be visible, failures explain a next step, and empty search offers a reset. Dialogs keep keyboard focus inside while open. Saving prevents duplicate submission, preserves entered values on failure and provides inline recovery. Undo feedback remains available while hovered or keyboard-focused.

## Motion

Use tokens in tokens.css. Movement communicates a workspace, panel or overlay transition. Ease out on arrival and in on exit, without bounce. Avoid replaying cascades across routine result updates. Respect both system and Splash reduced motion settings.

## Verification

Verify the running development app, including small-window overlays, keyboard navigation, empty and populated panels, save failures, light/dark appearance and reduced motion. Unit tests supplement visual checks; they do not replace them.
