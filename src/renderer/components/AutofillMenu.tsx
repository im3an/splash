import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CreditCard,
  KeyRound,
  MapPin,
  Settings2,
  Sparkles,
  type LucideIcon,
} from '../icons';
import type { AutofillItem } from '../../shared/vault';
import { api } from '../splash-api';

const ICONS: Record<AutofillItem['kind'], LucideIcon> = {
  login: KeyRound,
  address: MapPin,
  card: CreditCard,
  generate: Sparkles,
  manage: Settings2,
};

/**
 * The menu under a form field, in its own window. The field keeps the keyboard,
 * so arrows and Return come here by way of the page's preload.
 */
export function AutofillMenu() {
  const [items, setItems] = useState<AutofillItem[]>([]);
  const [index, setIndex] = useState(-1);
  const list = useRef<HTMLUListElement>(null);
  const latest = useRef({ items, index });
  latest.current = { items, index };

  useEffect(() => {
    void api().currentAutofill().then(setItems);
    return api().onAutofill((message) => {
      if (message.type === 'show') {
        setItems(message.items);
        setIndex(-1);
        return;
      }
      const current = latest.current;
      const count = current.items.length;
      if (message.key === 'enter') {
        const item = current.items[current.index];
        if (item) void api().chooseAutofill(item.id);
      } else if (count > 0) {
        const step = message.key === 'down' ? 1 : -1;
        setIndex((current.index + step + count) % count);
      }
    });
  }, []);

  // The window takes its height from the rows, and appears once it knows it.
  useLayoutEffect(() => {
    const height = list.current?.offsetHeight ?? 0;
    if (items.length > 0) api().resizeAutofill(height);
  }, [items]);

  return (
    <ul
      ref={list}
      role="listbox"
      aria-label="Fill this field"
      className="flex flex-col gap-px bg-elevated p-1 select-none"
    >
      {items.map((item, position) => {
        const Icon = ICONS[item.kind];
        return (
          <li key={item.id} role="presentation">
            {item.kind === 'manage' && items.length > 1 && (
              <div role="separator" className="my-1 h-px bg-divider" />
            )}
            <button
              type="button"
              role="option"
              aria-selected={position === index}
              onMouseEnter={() => setIndex(position)}
              onClick={() => void api().chooseAutofill(item.id)}
              className="flex min-h-8 w-full items-center gap-2.5 rounded-row px-2 py-1 text-left text-fg aria-selected:bg-row-hover"
            >
              <Icon size={15} className="shrink-0 text-fg-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.title}</span>
                {item.detail && (
                  <span className="block truncate text-small text-fg-subtle">
                    {item.detail}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
