/**
 * What goes into a diagnostics report. Nothing here leaves the Mac: the report
 * is a text file the user saves and chooses to send. Addresses are cut down to
 * their site and the home folder to `~`, so it can be read before sharing
 * without giving away where someone has been.
 */

export interface LogEntry {
  time: number;
  level: 'warn' | 'error' | 'event';
  text: string;
}

/** Keeps the latest entries, oldest first. */
export class LogRing {
  private readonly entries: LogEntry[] = [];

  constructor(private readonly limit = 400) {}

  add(entry: LogEntry): void {
    this.entries.push({ ...entry, text: entry.text.slice(0, 2000) });
    if (this.entries.length > this.limit) this.entries.shift();
  }

  list(): readonly LogEntry[] {
    return this.entries;
  }
}

const URL_PATTERN = /\b([a-z][a-z0-9+.-]*):\/\/([^\s/'"<>)\]]*)[^\s'"<>)\]]*/gi;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

/** Keeps the scheme and host of each address, and hides the rest. */
export function redact(text: string, home: string | null): string {
  let result = text.replace(URL_PATTERN, (_, scheme: string, host: string) => {
    // Credentials in an address would sit before the host.
    const bare = host.slice(host.lastIndexOf('@') + 1);
    return scheme.toLowerCase() === 'file'
      ? 'file://…'
      : `${scheme}://${bare}/…`;
  });
  if (home) result = result.split(home).join('~');
  return result.replace(EMAIL_PATTERN, '<email>');
}

export interface CrashFile {
  name: string;
  time: number;
}

export interface ReportInput {
  now: number;
  app: { version: string; packaged: boolean };
  versions: { electron: string; chromium: string; node: string };
  system: {
    macOS: string;
    arch: string;
    model: string | null;
    memoryGb: number;
    cpus: number;
    locale: string;
  };
  uptimeSeconds: number;
  processes: { type: string; memoryMb: number }[];
  extensions: { name: string; version: string; enabled: boolean }[];
  crashes: CrashFile[];
  log: readonly LogEntry[];
  home: string | null;
}

function stamp(time: number): string {
  return new Date(time).toISOString().replace('T', ' ').slice(0, 19);
}

function duration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

/** The report as plain text, in the order someone reading it needs it. */
export function buildReport(input: ReportInput): string {
  const lines: string[] = [
    'Splash diagnostics report',
    `Made ${stamp(input.now)} UTC. Addresses show only their site; nothing else about your browsing is included.`,
    '',
    '## Splash',
    `Version: ${input.app.version}${input.app.packaged ? '' : ' (development build)'}`,
    `Electron ${input.versions.electron} · Chromium ${input.versions.chromium} · Node ${input.versions.node}`,
    `Running for: ${duration(input.uptimeSeconds)}`,
    '',
    '## Mac',
    `macOS ${input.system.macOS} · ${input.system.arch}${input.system.model ? ` · ${input.system.model}` : ''}`,
    `${input.system.cpus} cores · ${input.system.memoryGb} GB memory · ${input.system.locale}`,
    '',
    '## Processes',
  ];
  const byType = new Map<string, { count: number; memoryMb: number }>();
  for (const process of input.processes) {
    const known = byType.get(process.type) ?? { count: 0, memoryMb: 0 };
    known.count += 1;
    known.memoryMb += process.memoryMb;
    byType.set(process.type, known);
  }
  for (const [type, { count, memoryMb }] of byType) {
    lines.push(`${type}: ${count}, ${Math.round(memoryMb)} MB`);
  }
  lines.push('', '## Extensions');
  if (input.extensions.length === 0) lines.push('None');
  for (const extension of input.extensions) {
    lines.push(
      `${extension.name} ${extension.version}${extension.enabled ? '' : ' (off)'}`,
    );
  }
  lines.push('', '## Crash reports on this Mac');
  if (input.crashes.length === 0) lines.push('None');
  for (const crash of [...input.crashes].sort((a, b) => b.time - a.time)) {
    lines.push(`${stamp(crash.time)}  ${crash.name}`);
  }
  lines.push('', '## Recent warnings and errors');
  if (input.log.length === 0) lines.push('None since Splash started');
  for (const entry of input.log) {
    lines.push(
      `${stamp(entry.time)}  ${entry.level.padEnd(5)}  ${redact(entry.text, input.home)}`,
    );
  }
  return `${lines.join('\n')}\n`;
}
