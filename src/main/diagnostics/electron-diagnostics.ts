import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { cpus, homedir, totalmem } from 'node:os';
import path from 'node:path';
import { format } from 'node:util';
import { app, crashReporter, dialog, shell, type BaseWindow } from 'electron';
import { LogRing, buildReport, type CrashFile } from './diagnostics';

const log = new LogRing();

/**
 * Keeps crash reports on this Mac (never uploaded) and remembers recent
 * warnings, errors and processes that ended, for the report. Call before the
 * app is ready, so a crash at startup is caught too.
 */
export function startDiagnostics(): void {
  crashReporter.start({ uploadToServer: false });
  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...values: unknown[]) => {
      log.add({ time: Date.now(), level, text: format(...values) });
      original(...values);
    };
  }
  app.on('render-process-gone', (_event, contents, details) => {
    log.add({
      time: Date.now(),
      level: 'event',
      text: `A ${contents.getType()} process ended: ${details.reason}, exit code ${details.exitCode}`,
    });
  });
  app.on('child-process-gone', (_event, details) => {
    log.add({
      time: Date.now(),
      level: 'event',
      text: `The ${details.name ?? details.type} process ended: ${details.reason}, exit code ${details.exitCode}`,
    });
  });
}

function crashFolder(): string {
  return app.getPath('crashDumps');
}

function crashFiles(folder = crashFolder()): CrashFile[] {
  let entries;
  try {
    entries = readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return crashFiles(file);
    if (!entry.name.endsWith('.dmp')) return [];
    return [{ name: entry.name, time: statSync(file).mtimeMs }];
  });
}

function macModel(): string | null {
  try {
    return execFileSync('sysctl', ['-n', 'hw.model'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function day(time: number): string {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Asks where to save the report, and saves it. False when cancelled. */
export async function exportDiagnostics(
  parent: BaseWindow,
  extensions: () => { name: string; version: string; enabled: boolean }[],
): Promise<boolean> {
  const now = Date.now();
  const report = buildReport({
    now,
    app: { version: app.getVersion(), packaged: app.isPackaged },
    versions: {
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
    },
    system: {
      macOS: process.getSystemVersion(),
      arch: process.arch,
      model: macModel(),
      memoryGb: Math.round(totalmem() / 1024 ** 3),
      cpus: cpus().length,
      locale: app.getLocale(),
    },
    uptimeSeconds: Math.round(process.uptime()),
    processes: app.getAppMetrics().map((metric) => ({
      type: metric.type,
      memoryMb: metric.memory.workingSetSize / 1024,
    })),
    extensions: extensions(),
    crashes: crashFiles(),
    log: log.list(),
    home: homedir(),
  });
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: 'Save Diagnostics Report',
    defaultPath: path.join(
      app.getPath('desktop'),
      `Splash diagnostics ${day(now)}.txt`,
    ),
    buttonLabel: 'Save',
  });
  if (canceled || !filePath) return false;
  writeFileSync(filePath, report);
  shell.showItemInFolder(filePath);
  return true;
}

/** Shows the crash reports folder in the Finder, so they can be attached. */
export function showCrashReports(): void {
  const folder = crashFolder();
  mkdirSync(folder, { recursive: true });
  void shell.openPath(folder);
}

export function crashReportCount(): number {
  return crashFiles().length;
}
