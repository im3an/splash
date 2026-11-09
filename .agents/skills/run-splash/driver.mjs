#!/usr/bin/env node
// Drives a Splash dev instance over the Chrome DevTools Protocol.
// No dependencies: Node 22+ has fetch and WebSocket built in.
//
//   driver.mjs launch            start `electron-forge start` on a throwaway profile
//   driver.mjs wait              block until the shell's CDP target is up
//   driver.mjs targets           list CDP targets (shell, settings, pages)
//   driver.mjs eval '<js>' [t]   evaluate in a target (default: shell), print JSON
//   driver.mjs ss <name> [t]     CDP screenshot of a target's renderer only
//   driver.mjs winshot <name> [title]  real macOS window capture (shell + page views)
//   driver.mjs theme light|dark  force the app's colour scheme
//   driver.mjs quit              kill the instance this driver launched
//
// A target is matched as a substring of its URL or title: `shell` is
// index.html, `settings` the Settings window. Paths are relative to the repo.
// State (pid, port, profile, screenshots) lives in $SPLASH_RUN_DIR,
// default /tmp/splash-run.

import { spawn, execFileSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  openSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const RUN_DIR = resolve(process.env.SPLASH_RUN_DIR ?? '/tmp/splash-run');
const STATE = join(RUN_DIR, 'state.json');
const SHOTS = join(RUN_DIR, 'shots');
mkdirSync(SHOTS, { recursive: true });

const state = () =>
  existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const port = () => Number(process.env.SPLASH_CDP_PORT ?? state().port ?? 9471);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const res = await fetch(`http://127.0.0.1:${port()}/json/list`);
  return res.json();
}

async function findTarget(match = 'shell') {
  const list = (await targets()).filter((t) => t.type === 'page');
  const want =
    match === 'shell'
      ? (t) =>
          /\/index\.html|localhost:\d+\/$/.test(t.url) &&
          !/settings/i.test(t.url)
      : (t) => t.url.includes(match) || t.title.includes(match);
  const t = list.find(want);
  if (!t)
    throw new Error(
      `no target matching "${match}":\n${list.map((t) => `  ${t.url}`).join('\n')}`,
    );
  return t;
}

async function session(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { r, j } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) j(new Error(msg.error.message));
      else r(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((r, j) => {
      pending.set(++id, { r, j });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => ws.close() };
}

async function evaluate(js, match) {
  const s = await session(await findTarget(match));
  try {
    const { result, exceptionDetails } = await s.send('Runtime.evaluate', {
      expression: js,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
      replMode: true,
    });
    if (exceptionDetails)
      throw new Error(
        exceptionDetails.exception?.description ?? exceptionDetails.text,
      );
    return result.value;
  } finally {
    s.close();
  }
}

async function screenshot(name, match) {
  const s = await session(await findTarget(match));
  try {
    const { data } = await s.send('Page.captureScreenshot', { format: 'png' });
    const file = join(SHOTS, `${name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  } finally {
    s.close();
  }
}

// The shell's CDP screenshot leaves holes where WebContentsViews (pages)
// paint. A real window capture includes them; it needs the window's
// CGWindowID, which only CoreGraphics knows.
function windowId(title = '') {
  // Only on-screen windows with a title count: Electron also keeps hidden
  // 500x500 helper windows and 39px menu-bar entries, which capture blank.
  const swift = `
import CoreGraphics
let args = Array(CommandLine.arguments.dropFirst())
let title = args[0]
let pids = Set(args.dropFirst().compactMap { Int($0) })
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
var best: (Int, Double)? = nil
for w in list {
  guard let p = w[kCGWindowOwnerPID as String] as? Int, pids.contains(p),
        (w[kCGWindowLayer as String] as? Int) == 0,
        let name = w[kCGWindowName as String] as? String, !name.isEmpty,
        title.isEmpty || name.contains(title),
        let b = w[kCGWindowBounds as String] as? [String: Double] else { continue }
  let area = (b["Width"] ?? 0) * (b["Height"] ?? 0)
  if best == nil || area > best!.1 { best = (w[kCGWindowNumber as String] as! Int, area) }
}
if let b = best { print(b.0) }`;
  const file = join(RUN_DIR, 'winid.swift');
  writeFileSync(file, swift);
  const pids = execFileSync('pgrep', ['-f', `remote-debugging-port=${port()}`])
    .toString()
    .trim()
    .split('\n');
  return execFileSync('swift', [file, title, ...pids])
    .toString()
    .trim();
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case 'launch': {
    const p = Number(args[0] ?? process.env.SPLASH_CDP_PORT ?? 9471);
    const profile = join(RUN_DIR, 'profile');
    mkdirSync(profile, { recursive: true });
    const log = openSync(join(RUN_DIR, 'app.log'), 'a');
    const child = spawn(
      'npx',
      [
        'electron-forge',
        'start',
        '--',
        `--user-data-dir=${profile}`,
        `--remote-debugging-port=${p}`,
        // The test window usually sits behind the user's apps. Without these
        // Chromium stops painting it, rAF and transitions freeze, and every
        // screenshot is stale.
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
      ],
      { detached: true, stdio: ['ignore', log, log] },
    );
    child.unref();
    writeFileSync(
      STATE,
      JSON.stringify({ pid: child.pid, port: p, profile }, null, 2),
    );
    console.log(
      `launched pid ${child.pid} on CDP port ${p}; log ${join(RUN_DIR, 'app.log')}`,
    );
    break;
  }
  case 'wait': {
    // On a cold start Vite optimises dependencies and reloads the shell
    // once, so a single "loaded" reading can come from the page that's about
    // to go away. Wait for the preload API and three steady seconds.
    let steady = 0;
    for (let i = 0; i < 120; i++) {
      try {
        const t = await findTarget('shell');
        const ok = await evaluate(
          "document.readyState === 'complete' && typeof window.splash === 'object' && !!document.querySelector('#root > *')",
        );
        steady = ok ? steady + 1 : 0;
        if (steady >= 3) {
          console.log(`ready: ${t.url}`);
          process.exit(0);
        }
      } catch {
        steady = 0;
      }
      await sleep(1000);
    }
    console.error('timed out after 120 s; see app.log');
    process.exit(1);
  }
  case 'targets':
    for (const t of await targets())
      console.log(
        `${t.type.padEnd(16)} ${t.title.slice(0, 40).padEnd(40)} ${t.url}`,
      );
    break;
  case 'eval':
    console.log(JSON.stringify(await evaluate(args[0], args[1]), null, 2));
    break;
  case 'ss':
    console.log(await screenshot(args[0] ?? 'shot', args[1]));
    break;
  case 'winshot': {
    // Optional second arg: a window-title substring, e.g. Settings.
    const id = windowId(args[1]);
    if (!id) throw new Error('no on-screen window found for this instance');
    const file = join(SHOTS, `${args[0] ?? 'window'}.png`);
    execFileSync('screencapture', ['-x', '-o', '-l', id, file]);
    console.log(file);
    break;
  }
  case 'theme':
    console.log(
      JSON.stringify(
        await evaluate(
          `window.splash.updatePreferences({ theme: ${JSON.stringify(args[0])} })`,
        ),
      ),
    );
    break;
  case 'quit': {
    const { pid } = state();
    try {
      execFileSync('pkill', ['-f', `remote-debugging-port=${port()}`]);
    } catch {}
    if (pid)
      try {
        process.kill(-pid);
      } catch {}
    console.log('stopped');
    break;
  }
  default:
    console.log(
      readFileSync(new URL(import.meta.url), 'utf8')
        .split('\n')
        .slice(1, 17)
        .join('\n'),
    );
}
