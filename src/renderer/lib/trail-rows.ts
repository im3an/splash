/**
 * How far in a sidebar row sits at each depth. The trail and the Favorites
 * list share it, so a level of nesting looks the same in both.
 */
export const INDENT = 14;
/** The minimal style's step: a chevron's width, so levels line up with it. */
export const MINIMAL_INDENT = 16;
/** Where a row's chevron sits, so guides line up under it. */
export const CHEVRON_CENTER = 6 + 8;
/** Where a top-level favicon starts, after the chevron column or without it. */
export const LEAD = 6 + 16 + 8;
export const FLAT_LEAD = 10;
/**
 * A nested row's box starts just past its parent's branch line, so its
 * fill wraps the row rather than running out to the sidebar's edge.
 */
const NEST_INSET = 3;

/** How far a row's box sits in from the trail's edge. */
export function rowOffset(depth: number): number {
  return depth === 0 ? 0 : depth * INDENT + NEST_INSET;
}

/** A row's box and where its content starts. Minimal rows run edge to edge. */
export function rowBox(depth: number, flat: boolean, minimal: boolean) {
  if (minimal)
    return { marginLeft: 0, paddingLeft: 6 + depth * MINIMAL_INDENT };
  const marginLeft = rowOffset(depth);
  return {
    marginLeft,
    paddingLeft: (flat ? FLAT_LEAD : 6) + depth * INDENT - marginLeft,
  };
}
