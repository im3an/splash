import { runPaletteItem } from '../lib/run-palette-item';
import { useSuggestions } from '../stores/suggestion-store';
import { AnchoredPanel } from './AnchoredPanel';
import { PaletteList } from './PaletteList';

/**
 * Suggestions under the address bar: go there, bookmarks and history, the
 * engine's suggestions and open pages.
 */
export function AddressSuggestions() {
  const items = useSuggestions((state) => state.items);
  const query = useSuggestions((state) => state.query);
  const selected = useSuggestions((state) => state.selected);
  const select = useSuggestions((state) => state.select);

  if (items.length === 0) return null;
  return (
    <AnchoredPanel width={null} label="Suggestions">
      <PaletteList
        items={items}
        selected={selected}
        onSelect={select}
        onRun={(item) => void runPaletteItem(item, 'address')}
        emptyLabel={null}
        query={query}
      />
    </AnchoredPanel>
  );
}
