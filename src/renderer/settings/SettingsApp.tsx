import { useEffect, useState, type ComponentType } from 'react';
import { Brand } from '../components/Brand';
import { api } from '../splash-api';
import { SectionIcon, type SectionIconName } from './SectionIcon';
import { useWorkspaceTheme } from '../hooks/use-workspace-theme';
import { useInterfacePreferences } from '../hooks/use-interface-preferences';
import {
  AdvancedSettings,
  AppearanceSettings,
  DownloadSettings,
  GeneralSettings,
  PageSettings,
  PrivacySettings,
  ShortcutSettings,
  WorkspaceSettings,
} from './sections';
import { ExtensionSettings } from './ExtensionSettings';
import { SettingsNavigation } from './navigation';
import { PasswordSettings } from './PasswordSettings';
import { TransferSettings } from './TransferSettings';
import { WaymarksSettings } from './Waymarks';
import { WAYMARKS_NAME } from '../../shared/waymarks';

const SECTIONS: {
  id: SectionIconName;
  label: string;
  /** A longer heading for the page, when the nav label is shortened. */
  title?: string;
  body: ComponentType;
}[] = [
  { id: 'general', label: 'General', body: GeneralSettings },
  { id: 'waymarks', label: WAYMARKS_NAME, body: WaymarksSettings },
  { id: 'extensions', label: 'Extensions', body: ExtensionSettings },
  {
    id: 'appearance',
    label: 'Appearance',
    body: AppearanceSettings,
  },
  {
    id: 'workspaces',
    label: 'Workspaces',
    body: WorkspaceSettings,
  },
  {
    id: 'pages',
    label: 'Pages',
    title: 'How pages look',
    body: PageSettings,
  },
  {
    id: 'privacy',
    label: 'Privacy',
    title: 'Privacy and site permissions',
    body: PrivacySettings,
  },
  {
    id: 'passwords',
    label: 'Passwords',
    title: 'Passwords and autofill',
    body: PasswordSettings,
  },
  {
    id: 'transfer',
    label: 'Import and Export',
    title: 'Import and export',
    body: TransferSettings,
  },
  {
    id: 'downloads',
    label: 'Downloads',
    body: DownloadSettings,
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    body: ShortcutSettings,
  },
  { id: 'advanced', label: 'Advanced', body: AdvancedSettings },
];

/** The Settings window: sections on the left, the chosen one on the right. */
export function SettingsApp() {
  useWorkspaceTheme();
  useInterfacePreferences();
  const [active, setActive] = useState<SectionIconName>(SECTIONS[0]!.id);
  // "Manage Extensions…" and the like open Settings on a section.
  useEffect(() => {
    const show = (section: string | null) => {
      const found = SECTIONS.find((candidate) => candidate.id === section);
      if (found) setActive(found.id);
    };
    void api().takeSettingsSection().then(show);
    return api().onSettingsSection(show);
  }, []);
  const section =
    SECTIONS.find((candidate) => candidate.id === active) ?? SECTIONS[0]!;
  const Body = section.body;

  return (
    <div className="flex h-full">
      <nav
        aria-label="Settings sections"
        className="drag flex w-(--settings-nav-width) shrink-0 flex-col gap-px px-2 pt-[calc(var(--toolbar-height)+var(--space-1))]"
      >
        <div className="px-2.5 pb-5">
          <Brand />
        </div>
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={id === active ? 'page' : undefined}
            onClick={() => setActive(id)}
            // The browser sidebar's current-page surface: accent is kept
            // for on-states and workspace identity, not for selection.
            className="flex h-8 items-center gap-2.5 rounded-row px-2 text-left text-fg-muted transition-colors duration-fast hover:bg-row-hover hover:text-fg active:bg-row-pressed aria-[current=page]:bg-row-hover aria-[current=page]:text-fg"
          >
            <SectionIcon name={id} />
            <span className="truncate">{label}</span>
          </button>
        ))}
        {/* Rows that wait for a reload or the next launch say so. */}
        <p className="mt-auto px-2.5 pb-4 text-small leading-copy text-fg-subtle">
          Changes are saved and apply as you make them.
        </p>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto bg-surface">
        <div className="drag h-(--toolbar-height)" />
        <div className="mx-auto flex max-w-(--settings-measure) flex-col gap-7 px-8 pb-10 select-text">
          <h1 className="text-display font-semibold tracking-[-0.01em]">
            {section.title ?? section.label}
          </h1>
          <SettingsNavigation.Provider value={setActive}>
            <Body />
          </SettingsNavigation.Provider>
        </div>
      </main>
    </div>
  );
}
