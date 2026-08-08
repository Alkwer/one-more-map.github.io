# Browser and viewport support

The automated browser matrix is deliberately asymmetric. Desktop Chromium runs
the complete regression suite; mobile Chromium and WebKit run focused smoke
flows so browser coverage does not multiply every test.

## CI matrix

| Project                   | Browser and viewport                | Automated coverage                                                                                                                                          |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chromium`                | Desktop Chrome profile, 1280×720    | Full application and Pages regression suite                                                                                                                 |
| `mobile-chromium-smoke`   | Chromium, 390×844                   | First screen, chart import, console/network health, and no horizontal overflow before or after import                                                       |
| `webkit-smoke`            | Desktop Safari profile, 1280×720    | Load, chart import, Web Worker solve, result application, `localStorage` restore, JSON download, shared-layout creation/opening, and console/network health |
| `project-site-deployment` | Desktop Chrome profile, 1280×720    | Nested Pages redirect, JS/CSS/fonts/images, Web Worker, AHK download, theme redirect, and share-link path integrity                                         |
| `windows-playwright-exit` | Chromium probes on `windows-latest` | Bounded Playwright teardown and preview-port release                                                                                                        |

The shared Playwright fixture fails every project on page errors, console errors,
failed same-origin requests, or same-origin HTTP responses with status 400 or
higher.

## Intentionally narrower coverage

- The complete accessibility, dialog, storage-failure, file-import, submission,
  and clipboard-permission regressions remain Chromium-only.
- WebKit verifies the share workflow's address-bar fallback when clipboard
  access is rejected; only Chromium runs native clipboard permissions and every
  clipboard/file round trip.
- The mobile project is a 390×844 responsive guard, not a claim that every phone,
  orientation, or touch interaction is covered.
- The AutoHotkey importer and live Windows OCR integration remain Windows-only
  and require the manual matrix in [windows-ocr.md](windows-ocr.md). CI does not
  launch Path of Exile or execute live OCR.

## Local commands

Install both CI browser engines once, then run the bounded matrix:

```bash
npx playwright install chromium webkit
npm run test:e2e
```

After staging the Pages artifact with `npm run build:pages`, an individual smoke
project can be run with:

```bash
npx playwright test --project=mobile-chromium-smoke
npx playwright test --project=webkit-smoke
npx playwright test --project=project-site-deployment
```

Set `PLAYWRIGHT_PROJECT_SITE_PREFIX` before `npm run build:pages` and the
Playwright command to exercise another repository prefix. The deployable
artifact remains in `staging/`; only the ignored `staging-playwright/` wrapper
contains the additional nested path used by E2E.
