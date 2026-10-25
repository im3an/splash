import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  AWAKE_PAGE_CHOICES,
  SEARCH_ENGINES,
  type Preferences,
} from '../../shared/preferences';
import type {
  AboutInfo,
  ClearRange,
  DefaultBrowserStatus,
  PermissionDecision,
  SiteSettings,
} from '../../shared/types';
import { WorkspaceIcon } from '../components/WorkspaceIcon';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { Button, Choice, Row, Section, Toggle } from './controls';

function usePreferences(): [
  Preferences | null,
  (patch: Partial<Preferences>) => void,
] {
  const preferences = useShell((state) => state.preferences);
  const update = useCallback((patch: Partial<Preferences>) => {
    void api().updatePreferences(patch);
  }, []);
  return [preferences, update];
}

export function GeneralSettings() {
  const [preferences, update] = usePreferences();
  const [status, setStatus] = useState<DefaultBrowserStatus | null>(null);

  useEffect(() => {
    void api().defaultBrowserStatus().then(setStatus);
  }, []);

  if (!preferences) return null;
  return (
    <>
      <Section title="Startup">
        <Row
          label="Continue where you left off"
          help="Splash always reopens your workspaces, trails and pages, including their history and scroll position."
        />
      </Section>
      <Section title="Search">
        <Row
          label="Search engine"
          help="Used when what you type in the address bar isn’t a web address."
        >
          <select
            aria-label="Search engine"
            value={preferences.searchEngine}
            onChange={(event) =>
              update({
                searchEngine: event.target.value as Preferences['searchEngine'],
              })
            }
            className="h-7 rounded-[7px] bg-field px-2 text-[12px] text-fg outline-none"
          >
            {SEARCH_ENGINES.map((engine) => (
              <option key={engine.id} value={engine.id}>
                {engine.name}
              </option>
            ))}
          </select>
        </Row>
      </Section>
      <Section title="Default browser">
        <Row
          label={
            status?.isDefault
              ? 'Splash is your default browser'
              : 'Splash isn’t your default browser'
          }
          help={
            status && !status.canChange
              ? 'Available in the installed app. Development builds can’t register with macOS.'
              : 'Links you click in other apps open as new pages in Splash.'
          }
        >
          {status && !status.isDefault && (
            <Button
              tone="primary"
              disabled={!status.canChange}
              onClick={() => void api().makeDefaultBrowser().then(setStatus)}
            >
              Make default
            </Button>
          )}
        </Row>
      </Section>
    </>
  );
}

export function AppearanceSettings() {
  const [preferences, update] = usePreferences();
  if (!preferences) return null;
  return (
    <>
      <Section title="Appearance">
        <Row
          label="Theme"
          help="A workspace can choose its own light or dark mode, which takes precedence while it’s open."
        >
          <Choice
            label="Theme"
            value={preferences.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Row>
        <Row label="Density" help="Compact fits more pages in the sidebar.">
          <Choice
            label="Density"
            value={preferences.density}
            onChange={(density) => update({ density })}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        </Row>
        <Row
          label="Accent, frame and icon"
          help="These belong to each workspace, so every workspace can look different."
        >
          <Button
            onClick={() =>
              void api().editWorkspace(
                useShell.getState().snapshot?.activeWorkspaceId ?? null,
              )
            }
          >
            Customize current workspace…
          </Button>
        </Row>
      </Section>
    </>
  );
}

export function WorkspaceSettings() {
  const workspaces = useShell((state) => state.snapshot?.workspaces ?? []);
  const activeId = useShell((state) => state.snapshot?.activeWorkspaceId);
  return (
    <Section
      title="Workspaces"
      description="Each workspace keeps its own trail, active page and look. Deleting one can be undone with Reopen Closed (⇧⌘T)."
    >
      {workspaces.map((workspace, index) => (
        <div
          key={workspace.id}
          className="flex min-h-12 items-center gap-3 px-4 py-2"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-field text-[12px] font-semibold text-accent">
            <WorkspaceIcon
              icon={workspace.appearance.icon}
              name={workspace.name}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate">
              {workspace.name}
              {workspace.id === activeId && (
                <span className="ml-1.5 text-[12px] text-fg-subtle">
                  · open
                </span>
              )}
            </p>
            <p className="text-[12px] text-fg-subtle">
              {workspace.pageCount} page{workspace.pageCount === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            className="icon-button size-7"
            aria-label={`Move ${workspace.name} up`}
            title="Move up"
            disabled={index === 0}
            onClick={() => void api().moveWorkspace(workspace.id, index - 1)}
          >
            <ArrowUp size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-button size-7"
            aria-label={`Move ${workspace.name} down`}
            title="Move down"
            disabled={index === workspaces.length - 1}
            onClick={() => void api().moveWorkspace(workspace.id, index + 1)}
          >
            <ArrowDown size={14} strokeWidth={1.75} />
          </button>
          <Button onClick={() => void api().editWorkspace(workspace.id)}>
            Customize…
          </Button>
          <Button
            tone="danger"
            disabled={workspaces.length === 1}
            onClick={() => void api().deleteWorkspace(workspace.id)}
          >
            Delete
          </Button>
        </div>
      ))}
      <div className="px-4 py-2.5">
        <Button tone="primary" onClick={() => void api().editWorkspace(null)}>
          New workspace…
        </Button>
      </div>
    </Section>
  );
}

const DECISIONS: { value: PermissionDecision; label: string }[] = [
  { value: 'allow', label: 'Allow' },
  { value: 'ask', label: 'Ask' },
  { value: 'block', label: 'Block' },
];

const RANGES: { value: ClearRange; label: string }[] = [
  { value: 'hour', label: 'Last hour' },
  { value: 'day', label: 'Last 24 hours' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'all', label: 'All time' },
];

export function PrivacySettings() {
  const [sites, setSites] = useState<SiteSettings[] | null>(null);
  const [range, setRange] = useState<ClearRange>('hour');
  const [what, setWhat] = useState({
    history: true,
    cookies: false,
    cache: true,
    permissions: false,
    downloads: false,
  });
  const [result, setResult] = useState<{
    summary: string;
    undoToken: string | null;
  } | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadSites = useCallback(async () => {
    setSites(await api().listSiteSettings());
  }, []);
  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const clear = async () => {
    setClearing(true);
    try {
      setResult(await api().clearBrowsingData({ range, ...what }));
      await loadSites();
    } finally {
      setClearing(false);
    }
  };

  const nothingChosen = !Object.values(what).some(Boolean);

  return (
    <>
      <Section
        title="Clear browsing data"
        description="History follows the time range and can be undone for a minute. Cookies, cached files and permissions are cleared for all time and can’t be brought back."
      >
        <Row label="History from">
          <select
            aria-label="Time range"
            value={range}
            onChange={(event) => setRange(event.target.value as ClearRange)}
            className="h-7 rounded-[7px] bg-field px-2 text-[12px] text-fg outline-none"
          >
            {RANGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Row>
        {(
          [
            ['history', 'Browsing history', 'Addresses suggested as you type.'],
            [
              'cookies',
              'Cookies and site data',
              'Signs you out of most sites. All time.',
            ],
            [
              'cache',
              'Cached files',
              'Pages may load a little slower at first. All time.',
            ],
            [
              'permissions',
              'Site permissions',
              'Sites will ask again. All time.',
            ],
            [
              'downloads',
              'Download list',
              'Files stay on your Mac; only the list is cleared.',
            ],
          ] as const
        ).map(([key, label, help]) => (
          <Row key={key} label={label} help={help}>
            <Toggle
              label={label}
              checked={what[key]}
              onChange={(checked) =>
                setWhat((current) => ({ ...current, [key]: checked }))
              }
            />
          </Row>
        ))}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <p role="status" className="min-w-0 text-[12px] text-fg-muted">
            {result?.summary}
          </p>
          <div className="flex shrink-0 gap-2">
            {result?.undoToken && (
              <Button
                onClick={() =>
                  void api()
                    .undoClearBrowsingData(result.undoToken!)
                    .then((restored) =>
                      setResult({
                        summary: restored
                          ? 'History is back.'
                          : 'Too late to undo; the history is gone.',
                        undoToken: null,
                      }),
                    )
                }
              >
                Undo
              </Button>
            )}
            <Button
              tone="danger"
              disabled={nothingChosen || clearing}
              onClick={() => void clear()}
            >
              {clearing ? 'Clearing…' : 'Clear data'}
            </Button>
          </div>
        </div>
      </Section>

      <Section
        title="Site permissions"
        description="Choices you made for sites. A site you haven’t decided on asks the first time it needs something."
      >
        {sites === null ? (
          <div className="h-12" aria-busy="true" />
        ) : sites.length === 0 ? (
          <Row
            label="No sites yet"
            help="When you allow or block a site, it shows up here."
          />
        ) : (
          sites.map((site) => (
            <div key={site.origin} className="flex flex-col gap-1 px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate font-medium">{site.host}</p>
                <Button
                  onClick={() =>
                    void api().resetSite(site.origin).then(loadSites)
                  }
                >
                  Reset
                </Button>
              </div>
              {site.permissions.map((entry) => (
                <div
                  key={entry.permission}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-[12px] text-fg-muted">
                    {entry.label}
                  </span>
                  <Choice
                    label={`${entry.label} for ${site.host}`}
                    value={entry.decision}
                    onChange={(decision) =>
                      void api()
                        .setSitePermission(
                          site.origin,
                          entry.permission,
                          decision,
                        )
                        .then(loadSites)
                    }
                    options={DECISIONS.filter(
                      (option) =>
                        entry.permission !== 'sound' || option.value !== 'ask',
                    )}
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </Section>
    </>
  );
}

export function DownloadSettings() {
  const [preferences, update] = usePreferences();
  if (!preferences) return null;
  return (
    <Section title="Downloads">
      <Row label="Save files">
        <Choice
          label="Save files"
          value={preferences.downloads}
          onChange={(downloads) => update({ downloads })}
          options={[
            { value: 'folder', label: 'To Downloads' },
            { value: 'ask', label: 'Ask each time' },
          ]}
        />
      </Row>
      <Row
        label="Files that can run programs"
        help="Installers and scripts are saved, but Splash warns you and asks before opening them."
      />
      <Row label="Downloads folder">
        <Button onClick={() => void api().openDownloadsFolder()}>Open</Button>
      </Row>
    </Section>
  );
}

const SHORTCUTS: [string, [string, string][]][] = [
  [
    'Pages',
    [
      ['New page', '⌘T'],
      ['New child page', '⌥⌘T'],
      ['Close page', '⌘W'],
      ['Close branch', '⌥⌘W'],
      ['Reopen closed', '⇧⌘T'],
      ['Open location', '⌘L'],
      ['Command palette', '⌘K'],
    ],
  ],
  [
    'Navigation',
    [
      ['Back (then up the trail)', '⌘['],
      ['Forward (then into a branch)', '⌘]'],
      ['Reload', '⌘R'],
      ['Stop', '⌘.'],
    ],
  ],
  [
    'Page tools',
    [
      ['Find on page', '⌘F'],
      ['Find next / previous', '⌘G / ⇧⌘G'],
      ['Zoom in / out', '⌘+ / ⌘−'],
      ['Actual size', '⌘0'],
      ['Mute page', '⌃⌘M'],
    ],
  ],
  [
    'Window',
    [
      ['Toggle sidebar', '⌘S'],
      ['Switch workspace', '⌃1 – ⌃9'],
      ['New workspace', '⇧⌘N'],
      ['Settings', '⌘,'],
    ],
  ],
];

export function ShortcutSettings() {
  return (
    <>
      {SHORTCUTS.map(([group, shortcuts]) => (
        <Section key={group} title={group}>
          {shortcuts.map(([label, keys]) => (
            <Row key={label} label={label}>
              <kbd className="font-sans text-[12px] text-fg-muted">{keys}</kbd>
            </Row>
          ))}
        </Section>
      ))}
    </>
  );
}

export function AdvancedSettings() {
  const [preferences, update] = usePreferences();
  const [about, setAbout] = useState<AboutInfo | null>(null);
  useEffect(() => {
    void api().about().then(setAbout);
  }, []);
  if (!preferences) return null;
  return (
    <>
      <Section title="Memory">
        <Row
          label="Pages kept awake"
          help="Beyond this, the pages you used least recently fall asleep. They keep their place, history and scroll position, and wake when you open them. Pages playing sound never sleep."
        >
          <Choice
            label="Pages kept awake"
            value={preferences.awakePages}
            onChange={(awakePages) => update({ awakePages })}
            options={AWAKE_PAGE_CHOICES.map((count) => ({
              value: count,
              label: String(count),
            }))}
          />
        </Row>
      </Section>
      <Section title="Your data">
        <Row label="Data folder" help={about ? about.dataFolder : undefined}>
          <Button onClick={() => void api().openDataFolder()}>Show</Button>
        </Row>
      </Section>
      {about && (
        <Section title="About">
          <Row
            label={`Splash ${about.version}`}
            help={`Electron ${about.electron} · Chromium ${about.chromium}`}
          />
        </Section>
      )}
    </>
  );
}
