// Splash closed beta: receives sign-ups from the website (sites/splash-site/beta.js) and keeps them
// in the spreadsheet this script belongs to. Set up as described in README.md next to this file.
//
// The site sends two kinds of record, both as JSON:
//   { type: 'signup',  id, email, source, platform, page, ref, referrer, utm_source, … }
//   { type: 'answers', id, email, mac, browser, pages }
// A sign-up adds one row (or nothing, if that email is already on the list). Answers fill in the
// same row later. A sign-up that came through someone's ?ref= link adds one to their Referrals.

const SHEET_NAME = 'Sign-ups';

// Column title → field in the record. Order here is the order in the sheet.
const COLUMNS = [
  ['Signed up', null],
  ['Email', 'email'],
  ['Apple silicon', 'mac'],
  ['Browser now', 'browser'],
  ['Pages open', 'pages'],
  ['Referrals', null],
  ['Invited', null],
  ['Source', 'source'],
  ['Came from (ref)', 'ref'],
  ['Referrer site', 'referrer'],
  ['UTM source', 'utm_source'],
  ['UTM medium', 'utm_medium'],
  ['UTM campaign', 'utm_campaign'],
  ['UTM content', 'utm_content'],
  ['Device', 'platform'],
  ['Page', 'page'],
  ['ID', 'id'],
];

// Only these answers are kept, so the columns stay clean enough to sort and filter.
const ANSWERS = {
  mac: ['Yes, M1 or later', 'No, Intel', 'Not sure'],
  browser: ['Chrome', 'Safari', 'Arc', 'Firefox', 'Something else'],
  pages: ['Under 10', '10 to 30', '30 to 100', 'More than 100'],
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID = /^[a-z0-9]{6,32}$/i;

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return reply({ ok: false, error: 'busy' });
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const sheet = getSheet_();
    if (body.type === 'signup') return reply(signup_(sheet, body));
    if (body.type === 'answers') return reply(answers_(sheet, body));
    return reply({ ok: false, error: 'unknown type' });
  } catch (err) {
    return reply({ ok: false, error: 'bad request' });
  } finally {
    lock.releaseLock();
  }
}

// Opening the web app URL in a browser shows this, which is an easy way to check the deployment.
function doGet() {
  return reply({ ok: true, service: 'splash-beta' });
}

function signup_(sheet, body) {
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: 'email' };
  if (!ID.test(String(body.id || ''))) return { ok: false, error: 'id' };

  const table = read_(sheet);
  // Already on the list: say yes without adding a second row (and without telling anyone it existed).
  if (findRow_(table, 'Email', email)) return { ok: true };

  const row = COLUMNS.map(([title, key]) => {
    if (title === 'Signed up') return new Date();
    if (title === 'Referrals') return 0;
    if (title === 'Invited') return false;
    return key === 'email' ? email : clean_(body[key]);
  });
  sheet.appendRow(row);
  // Formatting goes on each new row as it lands. Pre-filling a whole column with checkboxes would
  // count as content, and the next sign-up would be appended below all of them.
  const last = sheet.getLastRow();
  sheet.getRange(last, table.col['Signed up'] + 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(last, table.col['Invited'] + 1).insertCheckboxes();

  const ref = String(body.ref || '');
  if (ID.test(ref) && ref !== body.id) {
    const referrer = findRow_(table, 'ID', ref);
    if (referrer) {
      const col = table.col['Referrals'];
      sheet.getRange(referrer, col + 1).setValue((Number(table.rows[referrer - 1][col]) || 0) + 1);
    }
  }
  return { ok: true };
}

function answers_(sheet, body) {
  const table = read_(sheet);
  const email = String(body.email || '').trim().toLowerCase();
  // By id first; by email when the address was already on the list from an earlier visit.
  const row = (ID.test(String(body.id || '')) && findRow_(table, 'ID', String(body.id))) || (email && findRow_(table, 'Email', email));
  if (!row) return { ok: false, error: 'not found' };
  for (const [title, key] of COLUMNS) {
    if (!ANSWERS[key]) continue;
    if (ANSWERS[key].indexOf(body[key]) !== -1) sheet.getRange(row, table.col[title] + 1).setValue(body[key]);
  }
  return { ok: true };
}

// The sheet as values, with a lookup from column title to index. Rows are 1-based like the sheet.
function read_(sheet) {
  const rows = sheet.getDataRange().getValues();
  const col = {};
  (rows[0] || []).forEach((title, i) => { col[title] = i; });
  return { rows, col };
}

function findRow_(table, title, value) {
  const c = table.col[title];
  if (c === undefined) return 0;
  const want = String(value).toLowerCase();
  for (let r = 1; r < table.rows.length; r++) {
    if (String(table.rows[r][c]).toLowerCase() === want) return r + 1;
  }
  return 0;
}

// Text from the web goes into cells as text: never as a formula, and never longer than it needs to be.
function clean_(value) {
  if (value === undefined || value === null) return '';
  const text = String(value).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function getSheet_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;
  sheet = book.insertSheet(SHEET_NAME);
  sheet.appendRow(COLUMNS.map(([title]) => title));
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
  return sheet;
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
