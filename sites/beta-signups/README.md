# Beta sign-ups → Google Sheet

The website's closed-beta form (`sites/splash-site/beta.js`) posts each sign-up to a small Google Apps Script, `Code.gs`. The script writes the sign-ups into a Google Sheet that you own. It takes about five minutes to set up, and it costs nothing.

## Set it up

1. Create a new Google Sheet (sheets.new) and name it something like **Splash beta**.
2. In the sheet, choose **Extensions › Apps Script**. Delete the starter code, paste in all of `Code.gs`, and save it (⌘S).
3. Choose **Deploy › New deployment**. Click the gear next to "Select type" and choose **Web app**, then set:
   - **Execute as:** Me
   - **Who has access:** Anyone

   Then click **Deploy**.
4. Google asks you to authorise the script. Choose your account, then **Advanced › Go to … (unsafe)**, then **Allow**. You see this warning because you wrote the script yourself and Google hasn't reviewed it. The script can only see this one spreadsheet.
5. Copy the **Web app URL**. It ends in `/exec`.
6. Check that it works. Open that URL in a browser, and it should show `{"ok":true,"service":"splash-beta"}`.
7. Paste the URL into `sites/splash-site/beta.js`:

   ```js
   const BETA_ENDPOINT = 'https://script.google.com/macros/s/…/exec';
   ```

The **Sign-ups** sheet tab is created the first time someone signs up.

**Live setup (9 Nov 2026):** the sheet is [Splash beta](https://docs.google.com/spreadsheets/d/17qmy4pgL9y2UUDjBsgXOH-SX3plM5Bfpd8LSVs4187M/edit) in imranmoujtahid@gmail.com, with the bound script project "Splash beta sign-ups". Its web app URL is the one in `beta.js`.

## What lands in the sheet

There is one row per email address, with these columns:

| Column | What it holds |
| --- | --- |
| Signed up, Email | When they signed up and their address. The address is stored in lower case, and signing up twice doesn't add a second row. |
| Apple silicon, Browser now, Pages open | Their answers to the three optional questions. These cells stay empty if they skipped a question. |
| Referrals | How many people signed up through this person's `?ref=` link. |
| Invited | A checkbox for you to tick once you've sent their invite. |
| Source | Which button they used: `nav`, `nav-pill`, `floating-pill`, `closing`, `footer`, or a `features-…` one. |
| Came from (ref), Referrer site, UTM … | How they found the site. |
| Device, Page, ID | The device they signed up on, the page they were on, and their referral id. |

**Choosing who to invite first.** Use **Data › Create a filter**. Then sort by **Referrals** and filter **Apple silicon** to "Yes, M1 or later".

## Changing the script later

Edit the code in Apps Script, then choose **Deploy › Manage deployments**. Click the pencil, set **Version** to **New version**, and click **Deploy**. That way the `/exec` URL stays the same. Choosing **New deployment** instead creates a new URL, and you would have to paste it into `beta.js` again.

## Notes

- Text from the website is always stored as plain text. Anything that starts with `=`, `+`, `-` or `@` gets an apostrophe in front of it, so the sheet never runs it as a formula.
- The form sends its data as `text/plain`, because Apps Script can't answer the CORS preflight that a JSON request would trigger. The script still reads the body as JSON.
- The web app URL is public. Anyone who finds it can post to it, but the script only accepts well-formed sign-ups. If spam starts arriving, it's easy to filter out by Source or Page.
