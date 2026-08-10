# Windows OCR live validation matrix

This runbook validates `public/voyage-import.ahk` against the live Path of Exile
Voyage Board. It supplements automated tests; it is not evidence that a row was
executed. Leave every result as `Not run` until a tester completes the row on
the recorded hardware and game build.

The web solver and manual border entry must remain usable when the helper or OCR
is unavailable.

## Evidence and privacy rules

- Use only a test account and non-sensitive charts. Never record an account
  name, character name, private league, chat, private key, full desktop, or
  unrelated window.
- Do not attach raw screenshots. Record the observed modifier text and values in
  the result table. If an OCR regression needs a fixture, crop to the tooltip,
  remove all identifying UI, and have a second person confirm the crop before it
  is committed.
- Do not attach `voyage-import.ini`, clipboard dumps, `%TEMP%` contents, crash
  dumps, or absolute user paths. Redact usernames from logs.
- Record only the Windows OCR language reported by the import status, not the
  user's full language profile.
- A fixture derived from a live capture must contain the minimum pixels or text
  needed to reproduce the bug, use a descriptive synthetic filename, and state
  its source game build and sanitization review in the pull request.

## Minimum matrix

Each row must be tested with the Voyage Board fully visible and unscrolled.
Record the exact Windows build, GPU scaling if it is not the default, and the
Path of Exile build in the run sheet.

| ID         | Windows  | Display and scale       | Game mode             | OCR language                                        | Privilege                      | Calibration | Result  |
| ---------- | -------- | ----------------------- | --------------------- | --------------------------------------------------- | ------------------------------ | ----------- | ------- |
| W10-1080-Q | 10       | 1920×1080, 100%         | Windowed              | `en-*`                                              | matched, standard              | quick       | Not run |
| W10-1440-E | 10       | 2560×1440, 125%         | Windowed Fullscreen   | `en-*`                                              | matched, standard              | exact       | Not run |
| W10-4K-E   | 10       | 3840×2160, 150% or 200% | Windowed              | installed non-English recognizer, English available | matched, standard              | exact       | Not run |
| W11-1080-E | 11       | 1920×1080, 100%         | Windowed Fullscreen   | `en-*`                                              | matched, standard              | exact       | Not run |
| W11-1440-Q | 11       | 2560×1440, 125%         | Windowed              | `en-*`                                              | matched, standard              | quick       | Not run |
| W11-4K-E   | 11       | 3840×2160, 150% or 200% | Windowed Fullscreen   | installed non-English recognizer, English available | matched, standard              | exact       | Not run |
| UIPI-PASS  | 10 or 11 | any matrix display      | either supported mode | any installed recognizer                            | game and helper both elevated  | exact       | Not run |
| UIPI-FAIL  | 10 or 11 | any matrix display      | either supported mode | any installed recognizer                            | elevated game, standard helper | exact       | Not run |

If Korean OCR is installed, use `ko-KR` for one non-English row. Otherwise use
the installed non-English recognizer and record it. The helper may select an
English recognizer first; the selected language in the solver status is the
authoritative value.

The six display rows are the minimum supported coverage. `UIPI-PASS` and
`UIPI-FAIL` may reuse one of those machines. Additional Windows builds, scales,
ultrawide displays, or languages are useful but do not replace a minimum row.

## Run sheet

Create one sanitized result record per row:

```text
Matrix ID:
Tester initials:
Date (UTC):
Helper commit SHA:
Path of Exile build:
Windows edition/build:
Display resolution / Windows scale / GPU scale:
Game mode:
Reported OCR language:
Game privilege / helper privilege:
PoE executable family (PathOfExile or PathOfExileSteam):
Calibration (quick or exact):
Grid (columns × rows; default or adjusted):
Result (Pass / Fail / Blocked):
Failed step and sanitized observation:
Sanitized fixture or follow-up issue, if any:
Limitations:
Reviewer initials:
```

Use `Blocked` only for an unavailable machine, game build, language capability,
or privilege setup. A product defect is `Fail`, with a separate issue linked
from the record.

## Preparation

1. Check out the exact helper commit recorded in the run sheet. Run
   `npm run validate` and record only whether it passed; do not paste local paths
   or environment output into the evidence.
2. Confirm AutoHotkey v2 and the intended Windows OCR language capability are
   installed. Start with no `voyage-border-<PID>-*.png`,
   `voyage-border-ocr-<PID>.txt`, or `voyage-border-ocr-<PID>.ps1` artifacts for
   the helper process under `%TEMP%`.
3. Start the game and helper at the privilege levels named by the matrix row.
   Use Windowed or Windowed Fullscreen mode; exclusive fullscreen is outside the
   supported matrix.
4. Focus the authentic game window and press `Ctrl+F3`. Record a failure if the
   helper accepts a non-PoE window, an ambiguous installation, or a changed
   process identity.
5. Open the solver at its expected URL. The tester, not the helper, returns to
   that URL and explicitly presses `Ctrl+V` after a successful scan.

## Calibration and preview

Run the calibration type named by the matrix row:

- **Quick:** hover the top-left border corner and press `F5`; hover the
  bottom-right corner and press `F6`.
- **Exact:** press `Ctrl+F5`, then hover each of the 12 requested tooltip points
  and press `Ctrl+F6`.
- Press `Ctrl+F4` and verify every stored border point. Also verify the reroll
  point after calibrating it with `Ctrl+F7` while the reroll-cost tooltip is
  visible.
- Press `F7` and `F8` over the top-left and bottom-right chart slots. Press
  `Shift+F7` and `Shift+F8` over stash tabs 1 and 2.
- First run the default `GridCols := 6` and `GridRows := 10`. On at least one
  row, repeat with a genuinely different visible grid and record the adjusted
  values. Do not count a source-only edit with the same effective grid as the
  adjusted-grid test.

A preview passes only when all points remain inside the intended board, reroll
button, slots, and tabs at the recorded Windows scale.

## Functional sequence

Perform the following in order for every display row:

1. Press `F9`. Verify both chart tabs are copied, tab 1 is restored, all 12
   border positions are represented, and the calibrated reroll cost maps to the
   solver's `Used` count. Explicitly paste into the verified solver page.
2. Compare every imported chart and modifier with the live UI. Record the
   reported OCR language and a sanitized list of any mismatch.
3. Reroll once, press `Ctrl+F9`, and explicitly paste again. Verify charts are
   unchanged while all 12 borders and the new reroll count are updated.
4. Make one tooltip unreadable without changing the other positions, then run
   `Ctrl+F9`. The complete snapshot must clear that position or reject the
   sweep; it must never retain the previous modifier while claiming success.
5. Interrupt a scan with `F10`. Existing solver borders must remain unchanged,
   and neither helper nor solver may report a completed sweep.
6. Close the helper during an active or deliberately failing OCR attempt and
   repeat with an OCR timeout or unavailable recognizer. Confirm that manual
   border entry in the solver still accepts and scores a border.

For `UIPI-PASS`, repeat `Ctrl+F3`, `Ctrl+F4`, `F9`, `Ctrl+F9`, and `F10` with
matching elevated privileges. For `UIPI-FAIL`, the standard helper must fail
closed against the elevated game: no input is sent, no stale success is shown,
and the UI tells the tester to match privilege levels or use UI Access. Do not
weaken either process merely to turn this negative row into a pass.

## Temporary-file cleanup

Inspect `%TEMP%` after each scenario, using the recorded helper PID to limit the
search. Verify cleanup after:

- a successful `F9` and `Ctrl+F9`;
- unreadable OCR, missing recognizer, and timeout failures;
- `F10` abort;
- normal helper exit and exit during a sweep.

No matching `voyage-border-<PID>-*.png` or
`voyage-border-ocr-<PID>.txt` may remain. No
`voyage-border-ocr-<PID>.ps1` should be created at any point because the OCR
bridge is executed in memory. A file held open by an unrelated process is an
environmental limitation only if the tester records how it was introduced;
otherwise leftover helper-owned data is a failure.

## Result table

Keep the aggregate table in the validation pull request or linked issue. Do not
replace `Not run` with `Pass` without a completed run sheet.

| Matrix ID  | Status  | Run-sheet link | Follow-up issue | Notes/limitations |
| ---------- | ------- | -------------- | --------------- | ----------------- |
| W10-1080-Q | Not run | —              | —               | —                 |
| W10-1440-E | Not run | —              | —               | —                 |
| W10-4K-E   | Not run | —              | —               | —                 |
| W11-1080-E | Not run | —              | —               | —                 |
| W11-1440-Q | Not run | —              | —               | —                 |
| W11-4K-E   | Not run | —              | —               | —                 |
| UIPI-PASS  | Not run | —              | —               | —                 |
| UIPI-FAIL  | Not run | —              | —               | —                 |

The live validation is complete only when all eight minimum rows are `Pass`,
every run sheet has a reviewer, any fixture is sanitized, all failures have
linked issues, the cleanup scenarios pass, and `npm run validate` passes at the
validated commit. Until then, keep the tracking issue open and state which
hardware or live-game prerequisite remains unavailable.
