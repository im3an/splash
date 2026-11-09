import { useEffect, useState } from 'react';
import type { AboutInfo, LicenceName } from '../../shared/types';
import { api } from '../splash-api';
import { Button, Row, Section } from './controls';

/** A licence's full text, read from the app, in a scrolling box. */
function LicenceText({ name }: { name: LicenceName }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    void api().licence(name).then(setText);
  }, [name]);
  return (
    <pre
      tabIndex={0}
      aria-label={name === 'splash' ? 'Splash’s licence' : 'Package licences'}
      className="max-h-80 overflow-auto px-4 py-3 font-mono text-small leading-copy whitespace-pre-wrap text-fg-muted select-text"
    >
      {text === null
        ? 'Loading…'
        : text || 'The licence text is missing from this build.'}
    </pre>
  );
}

function crashHelp(count: number): string {
  if (count === 0) return 'None on this Mac.';
  return `${count} on this Mac. Attach ${count === 1 ? 'it' : 'them'} with the report if Splash quit unexpectedly.`;
}

export function AboutSettings() {
  const [about, setAbout] = useState<AboutInfo | null>(null);
  const [shown, setShown] = useState<LicenceName | null>(null);
  const [report, setReport] = useState<'idle' | 'saving' | 'saved'>('idle');
  useEffect(() => {
    void api().about().then(setAbout);
  }, []);
  if (!about) return null;

  const toggle = (name: LicenceName) =>
    setShown((current) => (current === name ? null : name));
  const saveReport = async () => {
    setReport('saving');
    setReport((await api().exportDiagnostics()) ? 'saved' : 'idle');
  };

  return (
    <>
      <Section title="Version and licence">
        <Row
          label={`Version ${about.version}`}
          help={`Electron ${about.electron} · Chromium ${about.chromium}`}
        />
        <Row
          label="Free software"
          help="Licensed under the GNU General Public License, version 3: you may use, study, share and change it under its terms. It comes with no warranty."
        >
          <Button onClick={() => toggle('splash')}>
            {shown === 'splash' ? 'Hide Licence' : 'Licence'}
          </Button>
          <Button onClick={() => void api().openAboutLink('source')}>
            Source Code
          </Button>
        </Row>
        {shown === 'splash' && <LicenceText name="splash" />}
      </Section>

      <Section
        title="Privacy"
        description="Splash has no servers and no account. Apart from the pages you open, this is everything it connects to."
      >
        <Row
          label="Nothing about you is collected"
          help="No usage data, no analytics, no browsing history leaves this Mac. Your trails, passwords and history stay in your data folder."
        />
        <Row
          label="Search suggestions"
          help="While on, what you type in the address field goes to your search engine. Full addresses and local sites never do. Turn it off in General."
        />
        <Row
          label="Blocking and safety lists"
          help="uBlock Origin’s filter lists, the cookie-notice lists and a list of dangerous sites are downloaded and kept up to date. Only the lists are fetched."
        />
        <Row
          label="Site icons"
          help="To show an icon for a site in your history or bookmarks, Splash may ask that site for it."
        />
        <Row
          label="Extensions"
          help="Extensions you add from the Chrome Web Store come from Google and update through it. Each extension follows its own privacy policy."
        />
      </Section>

      <Section
        title="Diagnostics"
        description="Nothing is ever sent by itself. To report a problem, save a report and attach it to your message."
      >
        <Row
          label="Diagnostics report"
          help={
            report === 'saved'
              ? 'Saved. It’s plain text, so you can read it before sending.'
              : 'Versions, your Mac’s model and memory, extensions, crash dates and recent errors. Addresses show only the site.'
          }
        >
          <Button
            disabled={report === 'saving'}
            onClick={() => void saveReport()}
          >
            Save Report…
          </Button>
        </Row>
        <Row label="Crash reports" help={crashHelp(about.crashReports)}>
          <Button
            disabled={about.crashReports === 0}
            onClick={() => void api().showCrashReports()}
          >
            Show in Finder
          </Button>
        </Row>
      </Section>

      <Section
        title="Open-source software"
        description="Splash is built on these, under their own licences."
      >
        <Row
          label="uBlock Origin"
          help="By Raymond Hill and contributors, GPL-3.0. Included with its cookie-notice lists removed."
        >
          <Button onClick={() => void api().openAboutLink('ublock-source')}>
            Source Code
          </Button>
        </Row>
        <Row
          label="Electron and Chromium"
          help="MIT, BSD and other open-source licences."
        >
          <Button onClick={() => void api().openChromiumLicences()}>
            Licences
          </Button>
        </Row>
        <Row
          label="JavaScript packages"
          help="React, Zustand, Zod, the Ghostery blocker and others: MIT, ISC, MPL-2.0 and Apache-2.0."
        >
          <Button onClick={() => toggle('third-party')}>
            {shown === 'third-party' ? 'Hide Licences' : 'Licences'}
          </Button>
        </Row>
        {shown === 'third-party' && <LicenceText name="third-party" />}
      </Section>
    </>
  );
}
