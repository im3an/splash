// Closed beta sign-up, shared by index.html and features.html.
//
// Flow: email (one field, the only required step) → three optional one-tap questions that help pick
// who gets in first → done, with a link to pass on. Any [data-beta] link opens the form in a dialog so
// nobody loses their place; [data-beta-inline] holds the same form in the page. Someone who already
// signed up on this browser goes straight to the done step.
//
// Where sign-ups go: BETA_ENDPOINT is the web app URL of the Google Apps Script in sites/beta-signups,
// which writes them into a Google Sheet (setup in that folder's README). Each sign-up sends one 'signup'
// record and, if they answer, one 'answers' record with the same id. Until it's set, the form only
// pretends to work on localhost, so a live site never shows "You're on the list" for an address that
// went nowhere.
const BETA_ENDPOINT = 'https://script.google.com/macros/s/AKfycbw_poGzCcouvR3NYYqnXFb_jDP_iTYS_0Ceet9H_RXpqcUvLauBEhS65bFtz8MlMVS8qQ/exec';

(() => {
  const STORE = 'splash-beta';
  const QUESTIONS = [
    { key: 'mac', q: 'Is your Mac on Apple silicon?', options: ['Yes, M1 or later', 'No, Intel', 'Not sure'] },
    { key: 'browser', q: 'What do you browse with now?', options: ['Chrome', 'Safari', 'Arc', 'Firefox', 'Something else'] },
    { key: 'pages', q: 'How many pages do you usually have open?', options: ['Under 10', '10 to 30', '30 to 100', 'More than 100'] },
  ];

  const read = (store, key) => { try { return JSON.parse(store.getItem(key) || 'null'); } catch { return null; } };
  const write = (store, key, value) => { try { store.setItem(key, JSON.stringify(value)); } catch {} };

  // Where this visit came from, kept for the session so a later sign-up still carries it.
  const params = new URLSearchParams(location.search);
  const arrival = read(sessionStorage, STORE + '-arrival') || {};
  for (const k of ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) if (params.get(k)) arrival[k] = params.get(k).slice(0, 80);
  if (!arrival.referrer && document.referrer && !document.referrer.startsWith(location.origin)) arrival.referrer = document.referrer.slice(0, 200);
  write(sessionStorage, STORE + '-arrival', arrival);

  const ua = navigator.userAgent;
  const platform = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android'
    : /Macintosh|Mac OS X/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'windows' : /Linux|CrOS/.test(ua) ? 'linux' : 'other';
  const platformNote = {
    ios: 'You’re on your phone. Sign up here and the invite will be waiting in your inbox when you’re at your Mac.',
    android: 'You’re on your phone. Sign up here and the invite will be waiting in your inbox when you’re at your Mac.',
    windows: 'Splash runs on Macs with Apple silicon. If you have one as well, sign up and open the invite there.',
    linux: 'Splash runs on Macs with Apple silicon. If you have one as well, sign up and open the invite there.',
  }[platform] || '';

  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 12);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  async function send(record) {
    if (!BETA_ENDPOINT) {
      if (local) { console.info('[beta] BETA_ENDPOINT is not set; would send', record); return; }
      throw new Error('no endpoint');
    }
    // Sent as text/plain so the browser makes a simple request: Apps Script can't answer the CORS
    // preflight a JSON content type would trigger. The script parses the body as JSON either way.
    const res = await fetch(BETA_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    // Apps Script answers 200 even when it turns a record down, so the verdict is in the body.
    const reply = await res.json().catch(() => null);
    if (!reply || reply.ok !== true) throw new Error('rejected: ' + (reply && reply.error));
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  let count = 0;

  // One form instance. `where` names the CTA or place it was opened from, sent along as `source`.
  function mount(root, { titled }) {
    const n = ++count;
    let source = root.dataset.betaSource || 'page';
    let answers = {};
    let qi = 0;

    const stepEmail = () => {
      root.innerHTML = `<form class="beta-step" novalidate>
        ${titled ? '<h3 id="beta-title">Join the closed beta</h3>' : ''}
        <p class="beta-lede">We’re letting people in a few at a time, so we can fix what they find before everyone arrives. Leave your email and we’ll send an invite when there’s room.</p>
        <label class="beta-label" for="beta-email-${n}">Your email</label>
        <div class="beta-row">
          <input class="beta-input" id="beta-email-${n}" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" required aria-describedby="beta-err-${n} beta-fine-${n}">
          <button class="beta-submit" type="submit">Request an invite</button>
        </div>
        <div class="beta-hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></div>
        <p class="beta-error" id="beta-err-${n}" role="alert"></p>
        ${platformNote ? `<p class="beta-note">${platformNote}</p>` : ''}
        <p class="beta-fine" id="beta-fine-${n}"><b>Free during the beta.</b> For Macs with Apple silicon. We’ll only write when your invite is ready.</p>
      </form>`;
      const form = root.querySelector('form');
      const input = form.email;
      const err = form.querySelector('.beta-error');
      const button = form.querySelector('.beta-submit');
      input.addEventListener('input', () => { if (input.getAttribute('aria-invalid')) { input.removeAttribute('aria-invalid'); err.textContent = ''; } });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const email = input.value.trim();
        const fail = text => { err.textContent = text; input.setAttribute('aria-invalid', 'true'); input.focus(); };
        if (!email) return fail('Enter your email address.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail('That doesn’t look like an email address. Check for a typo?');
        const state = { id: newId(), email, at: new Date().toISOString() };
        if (form.website.value) { write(localStorage, STORE, state); return stepQuestions(state); } // a bot filled the hidden field
        button.disabled = true; button.textContent = 'Sending…';
        try {
          await send({ type: 'signup', id: state.id, email, source, platform, page: location.pathname, ...read(sessionStorage, STORE + '-arrival'), at: state.at });
          write(localStorage, STORE, state);
          window.dispatchEvent(new CustomEvent('beta:signed-up', { detail: root }));
          stepQuestions(state);
        } catch {
          button.disabled = false; button.textContent = 'Request an invite';
          err.textContent = 'That didn’t go through. Check your connection and try again.';
        }
      });
      return input;
    };

    const stepQuestions = state => {
      const q = QUESTIONS[qi];
      if (!q) return finish(state);
      root.innerHTML = `<div class="beta-step">
        ${qi === 0 ? `<div class="beta-check">${check}</div><h3 ${titled ? 'id="beta-title"' : ''}>You’re on the list</h3>
        <p class="beta-lede">Three quick taps help us choose who gets in first. Skip any you like.</p>` : ''}
        <div class="beta-progress"><span>Question ${qi + 1} of ${QUESTIONS.length}</span><button type="button" class="beta-skip">Skip</button></div>
        <p class="beta-q" id="beta-q-${n}">${esc(q.q)}</p>
        <div class="beta-chips" role="group" aria-labelledby="beta-q-${n}">
          ${q.options.map(o => `<button type="button" class="beta-chip" aria-pressed="false">${esc(o)}</button>`).join('')}
        </div>
      </div>`;
      const next = () => { qi++; stepQuestions(state); };
      root.querySelector('.beta-skip').addEventListener('click', next);
      root.querySelectorAll('.beta-chip').forEach(chip => chip.addEventListener('click', () => {
        chip.setAttribute('aria-pressed', 'true');
        answers[q.key] = chip.textContent;
        setTimeout(next, 180);
      }));
      root.querySelector('.beta-chip').focus({ preventScroll: true });
    };

    const finish = state => {
      if (Object.keys(answers).length) {
        send({ type: 'answers', id: state.id, email: state.email, ...answers, at: new Date().toISOString() }).catch(() => {});
        write(localStorage, STORE, { ...state, answered: true });
      }
      stepDone(state);
    };

    const stepDone = state => {
      const link = location.origin + location.pathname.replace(/(index|features)\.html$/, '') + '?ref=' + state.id;
      root.innerHTML = `<div class="beta-step">
        <div class="beta-check">${check}</div>
        <h3 ${titled ? 'id="beta-title"' : ''}>You’re on the list</h3>
        <p class="beta-lede">Your invite will go to <b>${esc(state.email)}</b>. Until then, Splash won’t write to you.</p>
        <div class="beta-share">
          <p>Know someone who always has forty pages open? Send them this link and we’ll know they came from you.</p>
          <div class="beta-link"><output>${esc(link.replace(/^https?:\/\//, ''))}</output><button type="button" class="beta-copy">Copy link</button></div>
        </div>
        <p class="beta-again">Wrong address? <button type="button" class="beta-skip beta-reset">Use a different email</button></p>
      </div>`;
      const copy = root.querySelector('.beta-copy');
      copy.addEventListener('click', async () => {
        const text = 'Splash is a Mac browser that keeps every page on a trail. Join the closed beta: ' + link;
        if (navigator.share && /ios|android/.test(platform)) { try { await navigator.share({ title: 'Splash closed beta', text, url: link }); return; } catch {} }
        try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select and copy'; }
        setTimeout(() => { copy.textContent = 'Copy link'; }, 1800);
      });
      root.querySelector('.beta-reset').addEventListener('click', () => {
        try { localStorage.removeItem(STORE); } catch {}
        answers = {}; qi = 0; stepEmail().focus();
      });
    };

    const start = from => {
      if (from) source = from;
      const state = read(localStorage, STORE);
      if (state?.email) { stepDone(state); return null; }
      qi = 0; answers = {};
      return stepEmail();
    };
    return { start };
  }

  // Inline form(s)
  const inline = [...document.querySelectorAll('[data-beta-inline]')].map(el => {
    el.classList.add('beta');
    const f = mount(el, { titled: false });
    f.start();
    return { el, f };
  });

  // Dialog, opened by any [data-beta] link
  const dialog = document.createElement('dialog');
  dialog.className = 'beta-dialog';
  dialog.setAttribute('aria-labelledby', 'beta-title');
  dialog.innerHTML = `<button type="button" class="beta-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button><div class="beta"></div>`;
  document.body.append(dialog);
  const form = mount(dialog.querySelector('.beta'), { titled: true });
  dialog.querySelector('.beta-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }); // a click on the backdrop
  // Signing up in one place moves the other forms on this page to "You're on the list" too.
  window.addEventListener('beta:signed-up', e => inline.forEach(({ el, f }) => { if (el !== e.detail) f.start(); }));

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-beta]');
    if (!a || typeof dialog.showModal !== 'function') return; // without <dialog>, the link scrolls to the inline form
    e.preventDefault();
    const input = form.start(a.dataset.beta || 'cta');
    dialog.showModal();
    input?.focus();
  });

  // Coming from someone's link: open the form once, after a moment on the page.
  if (arrival.ref && !read(localStorage, STORE) && !read(sessionStorage, STORE + '-shown')) {
    write(sessionStorage, STORE + '-shown', true);
    setTimeout(() => {
      if (dialog.open || typeof dialog.showModal !== 'function') return;
      const input = form.start('ref-link');
      dialog.showModal();
      input?.focus();
    }, 4000);
  }
})();
