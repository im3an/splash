# Splash design system

## Direction

Compact macOS browser chrome surrounds a rounded page surface. The sidebar is the primary navigation: workspace heading, New page, hierarchical trail and workspace controls at the foot. Preserve this composition and its quiet, personal feel.

## Color and surfaces

Source: src/renderer/styles/tokens.css, src/shared/appearance.ts and src/renderer/hooks/use-workspace-theme.ts. Paper uses #f3efe9 chrome and #faf8f5 page surfaces; graphite uses #1c1c1e chrome and #222224 surfaces. Workspaces choose an accent and frame preset. Floating panels use the elevated surface and panel shadow; structural separators use divider. Use fg, fg-muted and fg-subtle by role, with errors in danger and primary actions in accent/on-accent. Keep theme overrides synchronized.

## Typography and density

System UI font stack (SF Pro on macOS). Caption 11px, small 12px, body 13px, lead 14px, title 15px, display 20px. Use weight and spacing for hierarchy, without oversized headings in browser controls. Rows are 34px comfortable or 28px compact; toolbar 48px; sidebar 260px, expanded panels 380px.

## Shape and layout

Radii: mark 3px, inner 5px, row 6px, control 7px, pill/content 10px. Window gutter 8px. Controls typically use a 28px height and icons at 14–16px. Use existing icon-button and button classes. Keep contextual menus within the sidebar because Chromium page views paint above shell overlays.

## Interaction vocabulary

Native buttons, switches and segmented choices. Share segmented controls between workspace customization and settings. Inactive controls stay quiet; selected controls have a clear surface or mark; keyboard focus remains visible. Primary actions are reserved for the next meaningful step. Use page, trail, branch and workspace consistently.

## Panels and states

History and Downloads share header placement and empty-state hierarchy. Loading must be visible, failures explain a next step, and empty search offers a reset. Dialogs keep keyboard focus inside while open. Saving prevents duplicate submission, preserves entered values on failure and provides inline recovery. Undo feedback remains available while hovered or keyboard-focused.

## Motion

Use tokens in tokens.css. Movement communicates a workspace, panel or overlay transition. Ease out on arrival and in on exit, without bounce. Avoid replaying cascades across routine result updates. Respect both system and Splash reduced motion settings.

## Verification

Verify the running development app, including small-window overlays, keyboard navigation, empty and populated panels, save failures, light/dark appearance and reduced motion. Unit tests supplement visual checks; they do not replace them.
