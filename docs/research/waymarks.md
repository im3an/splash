# Waymarks: how the list was checked

Waymarks is Splash's bundled list of search shortcuts, in `src/shared/waymarks.ts`.
The list ships inside the app, so browsing it sends nothing anywhere.

## The name

A waymark is a trail sign saying where a path goes. A crumb marks where you've been,
which is the wrong way round for a search shortcut. The name is one constant,
`WAYMARKS_NAME`. The others considered were Blazes, Spurs and Crumbs.

## The check

On 2026-11-06 every address was opened in Chromium, in a hidden window with a throwaway
profile and no sign-in, with the search `coffee`. Images, media and fonts were blocked to
keep the load light. This was one run from one German connection.

It shows whether an address accepts a search, not that every site works for everyone.

| Result                                                                 | Sites   |
| ---------------------------------------------------------------------- | ------- |
| The search reached the address or title, and the word was on the page  | 191     |
| The search stayed in the address, but the word wasn't seen on the page | 79      |
| Redirected by the site to a result of its own                          | 2       |
| Asked to sign in, keeping the search                                   | 7       |
| Stopped at a consent page                                              | 2       |
| Stopped at a bot check, with status 200 or 202                         | 10      |
| Refused the probe with an error status                                 | 25      |
| Not confirmed: see below                                               | 2       |
| **Total**                                                              | **318** |

A blocked result says nothing about a person using a normal browser, since these sites
turn away automated visits. Those addresses are kept because their search format is well
known, but they are **not verified**.

## Removed

These lost the search or no longer exist, so they aren't in the list:

- Disney+ (`dp`): 404.
- Copilot (`cop`), Le Chat (`mist`), Trakt (`trakt`), Quora (`qu`) and Google Finance
  (`gfi`): sent to a home or sign-in page with the search gone.

## Not confirmed

- Facebook (`fb`): 404 when signed out. Kept because the address is meant for people
  signed in, but it hasn't been tried signed in.
- crt.sh (`crt`): answered 502 during the check. The service is often overloaded.

## By result

- Search kept, word not seen: `ab`, `amap`, `ap`, `ars`, `bbg`, `bby`, `bgg`, `bhn`, `cnn`, `cnrd`, `crs`, `cv`, `dl`, `drug`, `duden`, `dva`, `epi`, `epic`, `eth`, `etsy`, `fa`, `faz`, `fi`, `forvo`, `fv`, `geiz`, `gif`, `gog`, `hb`, `hl`, `hltb`, `ia`, `ido`, `ieee`, `ign`, `inv`, `kz`, `lidl`, `mc`, `mdn`, `mkt`, `mstar`, `nbb`, `nexus`, `np`, `nyt`, `obi`, `pat`, `pdb`, `pm`, `pxb`, `rewe`, `rvso`, `s2`, `sa`, `sat`, `seats`, `spr`, `sz`, `tc`, `tenor`, `thal`, `thg`, `tt`, `un`, `upw`, `verge`, `vin`, `vm`, `w3`, `wapo`, `wired`, `wmd`, `wowh`, `wwr`, `yf`, `yg`, `zal`, `zil`.
- Redirected to a result of its own: `gpt`, `mcw`.
- Sign-in: `cl`, `gl`, `ig`, `nf`, `x`, `xing`, `youcom`.
- Consent page: `fly`, `golem`.
- Bot check: `bc`, `bk`, `cpan`, `jstor`, `kagi`, `moj`, `pypi`, `se`, `sof`, `ss`.
- Error status: `acm`, `ast`, `atr`, `bhp`, `ccc`, `egg`, `etym`, `gn`, `gs`, `hd`, `itch`, `ln`, `mvn`, `pcgw`, `ph`, `rd`, `reu`, `sd`, `sdb`, `sdir`, `td`, `wf`, `wsj`, `yelp`, `zon`.

## Keywords

A keyword followed by a space takes over the address field, so a keyword that is also an
everyday word would catch ordinary typing. `WAYMARK_RESERVED_WORDS` lists English and
German words the list may not use, and a test enforces it.
