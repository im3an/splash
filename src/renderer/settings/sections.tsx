import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  TOOLBAR_ACTIONS,
  DEFAULT_PREFERENCES,
  AWAKE_PAGE_CHOICES,
  SEARCH_ENGINES,
  type Preferences,
} from '../../shared/preferences';
import type {
  AboutInfo,
  ClearRange,
  ContentBlockingStatus,
  DefaultBrowserStatus,
  PermissionDecision,
  SitePermission,
  SiteSettings,
} from '../../shared/types';
import { Brand } from '../components/Brand';
import { toolbarLabels } from '../components/ToolbarActions';
import { WorkspaceIcon } from '../components/WorkspaceIcon';
import { api } from '../splash-api';
import { selectWorkspaces, useShell } from '../stores/shell-store';
import { filterListsSummary } from '../lib/format';
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
          label="When Splash opens"
          help="Your workspaces and trails come back either way. Applies from the next launch."
        >
          <Choice
            label="When Splash opens"
            value={preferences.startup}
            onChange={(startup) => update({ startup })}
            options={[
              { value: 'restore', label: 'Pages as I left them' },
              { value: 'new-page', label: 'A new page' },
            ]}
          />
        </Row>
      </Section>
      <Section title="Search">
        <Row
          label="Search engine"
          help="Used for anything you type that isn’t a web address."
        >
          <select
            aria-label="Search engine"
            value={preferences.searchEngine}
            onChange={(event) =>
              update({
                searchEngine: event.target.value as Preferences['searchEngine'],
              })
            }
            className="h-7 rounded-control bg-field px-2 text-small text-fg"
          >
            {SEARCH_ENGINES.map((engine) => (
              <option key={engine.id} value={engine.id}>
                {engine.name}
              </option>
            ))}
          </select>
        </Row>
        <Row
          label="Show search suggestions"
          help="Sends what you type to your search engine as you type. Full addresses and local sites are never sent."
        >
          <Toggle
            label="Show search suggestions"
            checked={preferences.searchSuggestions}
            onChange={(searchSuggestions) => update({ searchSuggestions })}
          />
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
      <Section
        title="Toolbar"
        description="Choose which controls appear, and in what order."
      >
        {TOOLBAR_ACTIONS.map((action) => {
          const actions =
            preferences.toolbarActions ?? DEFAULT_PREFERENCES.toolbarActions;
          const index = actions.indexOf(action);
          const move = (step: number) => {
            const next = [...actions];
            [next[index], next[index + step]] = [
              next[index + step]!,
              next[index]!,
            ];
            update({ toolbarActions: next });
          };
          return (
            <Row key={action} label={toolbarLabels[action]}>
              <Button
                disabled={index <= 0}
                onClick={() => move(-1)}
                aria-label={`Move ${toolbarLabels[action]} earlier`}
              >
                <ArrowUp size={13} />
              </Button>
              <Button
                disabled={index < 0 || index === actions.length - 1}
                onClick={() => move(1)}
                aria-label={`Move ${toolbarLabels[action]} later`}
              >
                <ArrowDown size={13} />
              </Button>
              <Toggle
                label={toolbarLabels[action]}
                checked={index >= 0}
                onChange={(visible) =>
                  update({
                    toolbarActions: visible
                      ? [...actions, action]
                      : actions.filter((item) => item !== action),
                  })
                }
              />
            </Row>
          );
        })}
      </Section>
      <Section title="Appearance">
        <Row
          label="Theme"
          help="Websites follow it too. A workspace’s own theme wins while it’s open."
        >
          <Choice
            label="Theme"
            value={preferences.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
        </Row>
        <Row
          label="Address bar"
          help="Sidebar moves the address and navigation above your pages, so the page fills the window."
        >
          <Choice
            label="Address bar"
            value={preferences.addressBar}
            onChange={(addressBar) => update({ addressBar })}
            options={[
              { value: 'toolbar', label: 'Top bar' },
              { value: 'sidebar', label: 'Sidebar' },
            ]}
          />
        </Row>
        <Row label="Accent, frame and icon" help="Each workspace has its own.">
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
        <Row
          label="Reduce motion"
          help="Stops sliding and springing in Splash only. Splash already follows the macOS setting."
        >
          <Toggle
            label="Reduce motion"
            checked={preferences.reduceMotion}
            onChange={(reduceMotion) => update({ reduceMotion })}
          />
        </Row>
      </Section>
      <Section title="Sidebar">
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
          label="Show site names"
          help="Shows the site after each page’s title."
        >
          <Toggle
            label="Show site names"
            checked={preferences.showSiteNames}
            onChange={(showSiteNames) => update({ showSiteNames })}
          />
        </Row>
        <Row
          label="Show branch lines"
          help="Lines connecting each page to the pages opened from it."
        >
          <Toggle
            label="Show branch lines"
            checked={preferences.showBranchLines}
            onChange={(showBranchLines) => update({ showBranchLines })}
          />
        </Row>
      </Section>
    </>
  );
}

export function WorkspaceSettings() {
  const workspaces = useShell(selectWorkspaces);
  const activeId = useShell((state) => state.snapshot?.activeWorkspaceId);
  return (
    <Section
      title="Workspaces"
      description="Each keeps its own trail and look. Deleting one can be undone with ⇧⌘T."
    >
      {workspaces.map((workspace, index) => (
        <div
          key={workspace.id}
          className="flex min-h-12 items-center gap-3 px-4 py-2"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-control bg-field text-small font-semibold text-accent">
            <WorkspaceIcon
              icon={workspace.appearance.icon}
              name={workspace.name}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate">
              {workspace.name}
              {workspace.id === activeId && (
                <span className="ml-1.5 text-small text-fg-subtle">· open</span>
              )}
            </p>
            <p className="text-small text-fg-subtle">
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

/** Decided by Splash itself, so a site never asks for them. */
const NEVER_ASKED = new Set<SitePermission>(['sound', 'ads', 'insecure']);

function ContentBlockingSettings() {
  const [preferences, update] = usePreferences();
  const [status, setStatus] = useState<ContentBlockingStatus | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const next = await api().contentBlockingStatus();
      setStatus(next);
      // The first download takes a few seconds; show when it's done.
      if (next.state === 'loading') timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => clearTimeout(timer);
  }, []);

  const updateNow = async () => {
    setUpdating(true);
    try {
      setStatus(await api().updateFilterLists());
    } finally {
      setUpdating(false);
    }
  };

  if (!preferences) return null;
  return (
    <Section
      title="Ads and trackers"
      description="Uses uBlock Origin’s filter lists and EasyList, and takes effect as pages load. To allow ads on one site, open its settings from the address bar."
    >
      <Row label="Block ads and trackers" help="Harmful sites are blocked too.">
        <Toggle
          label="Block ads and trackers"
          checked={preferences.blockAds}
          onChange={(blockAds) => update({ blockAds })}
        />
      </Row>
      <Row
        label="Hide cookie notices"
        help="Rejects cookie banners and hides simple notices. Splash never accepts for you, so a banner it can’t reject stays. Off where you allow ads."
      >
        <Toggle
          label="Hide cookie notices"
          checked={preferences.hideCookieNotices}
          onChange={(hideCookieNotices) => update({ hideCookieNotices })}
        />
      </Row>
      <Row
        label="Filter lists"
        help={
          updating
            ? 'Downloading the filter lists…'
            : status && filterListsSummary(status, Date.now())
        }
      >
        <Button
          disabled={updating || status?.state === 'loading'}
          onClick={() => void updateNow()}
        >
          Update now
        </Button>
      </Row>
    </Section>
  );
}

function SecureConnectionSettings() {
  const [preferences, update] = usePreferences();
  if (!preferences) return null;
  return (
    <Section title="Connections">
      <Row
        label="HTTPS-only mode"
        help="Sends every site to HTTPS first. If a site doesn’t accept it, Splash asks before using HTTP. Addresses on your own network aren’t changed."
      >
        <Toggle
          label="HTTPS-only mode"
          checked={preferences.httpsOnly}
          onChange={(httpsOnly) => update({ httpsOnly })}
        />
      </Row>
    </Section>
  );
}

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
  const [restoring, setRestoring] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [sitesError, setSitesError] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    setSitesError(null);
    try {
      setSites(await api().listSiteSettings());
    } catch {
      setSitesError('Couldn’t load site permissions. Try again.');
    }
  }, []);
  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const clear = async () => {
    if (clearing) return;
    setClearing(true);
    setClearError(null);
    try {
      setResult(await api().clearBrowsingData({ range, ...what }));
      await loadSites();
    } catch {
      setClearError('Couldn’t finish clearing browsing data. Try again.');
    } finally {
      setClearing(false);
    }
  };

  const undoClear = async () => {
    if (!result?.undoToken || restoring) return;
    setRestoring(true);
    setClearError(null);
    try {
      const restored = await api().undoClearBrowsingData(result.undoToken);
      setResult({
        summary: restored
          ? 'History is back.'
          : 'Too late to undo; the history is gone.',
        undoToken: null,
      });
    } catch {
      setClearError('Couldn’t restore history. Try Undo again.');
    } finally {
      setRestoring(false);
    }
  };

  const nothingChosen = !Object.values(what).some(Boolean);

  return (
    <>
      <SecureConnectionSettings />
      <ContentBlockingSettings />
      <Section
        title="Clear browsing data"
        description="Only history follows the time range, and only history can be undone, for a minute."
      >
        <Row label="History from">
          <select
            aria-label="Time range"
            value={range}
            onChange={(event) => setRange(event.target.value as ClearRange)}
            className="h-7 rounded-control bg-field px-2 text-small text-fg"
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
            [
              'history',
              'Browsing history',
              'Addresses suggested as you type, and recently closed pages to reopen.',
            ],
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
          <p role="status" className="min-w-0 text-small text-fg-muted">
            {result?.summary}
          </p>
          <div className="flex shrink-0 gap-2">
            {result?.undoToken && (
              <Button
                disabled={restoring || clearing}
                onClick={() => void undoClear()}
              >
                {restoring ? 'Restoring…' : 'Undo'}
              </Button>
            )}
            <Button
              tone="danger"
              disabled={nothingChosen || clearing || restoring}
              onClick={() => void clear()}
            >
              {clearing ? 'Clearing…' : 'Clear data'}
            </Button>
          </div>
        </div>
        {clearError && (
          <p
            role="alert"
            className="px-4 pb-3 text-small leading-relaxed text-danger"
          >
            {clearError}
          </p>
        )}
      </Section>

      <Section
        title="Site permissions"
        description="Sites you’ve allowed or blocked. Others ask the first time they need something."
      >
        {sitesError ? (
          <Row label="Site permissions unavailable" help={sitesError}>
            <Button onClick={() => void loadSites()}>Try again</Button>
          </Row>
        ) : sites === null ? (
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
                  <span className="text-small text-fg-muted">
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
                        !NEVER_ASKED.has(entry.permission) ||
                        option.value !== 'ask',
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
        help="Splash asks before opening installers and scripts."
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
      ['Pin or unpin page', '⌘D'],
      ['Open location', '⌘L'],
      ['Open file', '⌘O'],
      ['Copy page address', '⇧⌘C'],
      ['Command palette', '⌘K'],
      ['Undo a trail change', '⌘Z'],
    ],
  ],
  [
    'Trail',
    [
      ['Filter pages', '⌥⌘F'],
      ['Move page up / down', '⌥⌘↑ / ⌥⌘↓'],
      ['Nest under the page above / move out', '⌥⌘→ / ⌥⌘←'],
      ['Rename page', 'F2'],
    ],
  ],
  [
    'Navigation',
    [
      ['Back (then up the trail)', '⌘['],
      ['Forward (then into a branch)', '⌘]'],
      ['Mouse back / forward buttons', 'Back / Forward'],
      ['Next / previous page', '⌃⇥ / ⌃⇧⇥'],
      ['Page 1 – 8 / last page', '⌘1 – ⌘8 / ⌘9'],
      ['Reload', '⌘R'],
      ['Reload ignoring cache', '⇧⌘R'],
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
      ['Print', '⌘P'],
      ['Save page as', '⇧⌘S'],
      ['View page source', '⌥⌘U'],
    ],
  ],
  [
    'Window',
    [
      ['Toggle sidebar', '⌘S'],
      ['Toggle split view', '⌘\\'],
      ['Downloads', '⌥⌘L'],
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
              <kbd className="font-sans text-small text-fg-muted">{keys}</kbd>
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
          help="Beyond this, your least recently used pages sleep. They keep their place and wake when opened. Pages playing sound stay awake."
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
          <div className="pb-4">
            <Brand size={32} />
          </div>
          <Row
            label={`Splash ${about.version}`}
            help={`Electron ${about.electron} · Chromium ${about.chromium}`}
          />
        </Section>
      )}
    </>
  );
}
