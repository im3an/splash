import { useRef, useState, type MouseEvent } from 'react';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';

interface OpenMenu {
  entries: MenuEntry[];
  x: number;
  y: number;
  element: HTMLElement;
  bounds: { left: number; right: number };
  keyboard: boolean;
  serial: number;
}

/**
 * A context menu for something in the sidebar: at the pointer for a right
 * click, under the element for a button or the keyboard, kept inside the
 * sidebar.
 */
export function useSidebarMenu(label: string) {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const serial = useRef(0);

  const show = (
    event: MouseEvent<HTMLElement>,
    entries: MenuEntry[],
    anchored = false,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const sidebar = element.closest('aside')?.getBoundingClientRect();
    const keyboard = event.clientX === 0 && event.clientY === 0;
    setMenu({
      entries,
      x: anchored || keyboard ? rect.left : event.clientX,
      y: anchored || keyboard ? rect.bottom : event.clientY,
      element,
      bounds: { left: sidebar?.left ?? 0, right: sidebar?.right ?? 260 },
      keyboard,
      serial: ++serial.current,
    });
  };

  const element = menu && (
    <ContextMenu
      key={menu.serial}
      label={label}
      entries={menu.entries}
      x={menu.x}
      y={menu.y}
      bounds={menu.bounds}
      fromKeyboard={menu.keyboard}
      returnFocus={menu.element}
      onClose={() => setMenu(null)}
    />
  );

  return { show, element, openOn: menu?.element ?? null };
}
