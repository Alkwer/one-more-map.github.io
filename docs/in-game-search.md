# In-game Chart search contract

The solver can copy three kinds of text for Path of Exile's Chart search box.
Search highlighting is an aid, not a correctness boundary: always verify the
highlighted Charts before moving them or starting a Voyage.

## Supported surfaces

| Surface                | English client | Korean client | Input evidence                                                  | Limitation                                                                                                   |
| ---------------------- | -------------- | ------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| One imported Chart     | Supported      | Supported     | Sanitized `charted.en.txt` and `charted.ko.txt` Ctrl+C fixtures | Uses name, revealed implicit, and localized level text; no alternation                                       |
| Solved-board candidate | Supported      | Supported     | The same fixtures plus synthetic duplicate/escaping cases       | Exact only relative to the fields modeled by `buildChartSearch`; the UI asks the player to verify highlights |
| Best-Charts Regex      | Supported      | Disabled      | Canonical English modifier text                                 | Korean selection returns no expression; verified Korean search fragments are not yet complete                |

The English and Korean fixture files live under
`src/logic/__fixtures__/charted.en.txt` and
`src/logic/__fixtures__/charted.ko.txt`. They contain no account, character, or
stash identifiers. Korean modifier aliases additionally record their provenance
in `implicit-aliases.ko.tsv` and `numeric-tier-aliases.ko.tsv`.

## Length limit

Path of Exile 1 increased the maximum length of search text boxes to 250
characters in 3.26.0. `MAX_CHART_SEARCH_LENGTH` therefore defaults to 250; the
Best-Charts UI also offers a conservative 50-character mode.

Primary source: [Content Update 3.26.0 — User Interface Changes](https://www.pathofexile.com/forum/view-thread/3787013/filter-account-type/staff).

## Repeatable live validation matrix

Run this matrix after a major client patch, after adding a client language, or
before broadening the fields used by `buildChartSearch`. Use disposable or
already-owned Charts and record text only; do not capture account, character,
or stash identifiers.

| Case              | Setup and query                                                                                                          | Expected observation                                                     | Record                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------ |
| Name              | Put two Charts with different names in the visible Chart inventory; paste a unique three-or-more-character name fragment | Only the Chart whose displayed name contains the fragment is highlighted | Client patch, language, query, pass/fail   |
| Revealed modifier | Use two same-name Charts with different revealed implicits; paste a literal fragment unique to one implicit              | Only the Chart with that implicit is highlighted                         | Sanitized implicit fragments and pass/fail |
| Area level        | Use same-name Charts at different area levels; paste the localized `Area Level: N` / `지역 레벨: N` fragment             | Only the requested level is highlighted                                  | Localized label, levels, pass/fail         |
| Rolled reward     | Use same-name and same-level Charts with different visible aggregate rewards                                             | A literal reward label/value selects only its Chart                      | Sanitized label/value and pass/fail        |
| Alternation       | Paste two independently confirmed unique literals joined with the vertical-bar alternation operator                      | The union of the two individual result sets is highlighted               | Literals, individual sets, union set       |
| Escaping          | Use a literal containing a regex metacharacter and paste the escaped form produced by the solver                         | The intended literal is matched; the expression is accepted              | Literal, generated expression, pass/fail   |
| Case handling     | Repeat an ASCII query in lower, upper, and mixed case                                                                    | All three queries highlight the same set                                 | Queries and result-set equality            |
| Length            | Paste sanitized expressions of 249, 250, and 251 characters                                                              | 249 and 250 are retained; the 251st character is rejected or truncated   | Accepted lengths and client behavior       |

For every run, also record whether the panel searches the displayed name,
revealed modifier, area level, and aggregate reward lines. A failed or changed
observation must become a minimized fixture and a unit regression before the
generator contract is changed.

## Automated contract checks

`src/logic/regex.test.ts` covers English/Korean fixture separation, literal
escaping, case-insensitive matching, alternation, the 250-character cap, exact
selection failures, `buildBestModRegex` family ranking, disabled modifiers, and
the Korean hard stop. These tests validate the generator against the recorded
contract; they do not replace a client run of the matrix above.
