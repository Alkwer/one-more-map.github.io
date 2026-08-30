# Interface localization

The interface supports English (`en`) and Korean (`ko`). The Language control in
the header changes the interface without remounting the application or changing
the chart library, board, or unsent import text. Its preference is saved separately
as `voyage-ui-locale`; it is not part of an exported or shared voyage.

At startup, a supported saved preference wins. Otherwise, the first supported
entry in `navigator.languages` is selected (`navigator.language` is a fallback).
Unsupported preferences fall back to English. Regional variants such as `ko-KR`
and `en-GB` resolve to the corresponding interface language. Blocked storage does
not prevent selection during the current visit.

The selected language is loaded before the first application render and updates
`document.documentElement.lang`. Korean translations are an optional lazy chunk;
English visits do not download that catalog. A catalog download failure leaves a
usable English interface. The pre-application anti-framing security notice keeps
the static document's English fallback and never accesses storage.

## Adding or changing copy

- Use `t('English source message')` for static interface copy and `t('Message
with {count}', { count })` for complete parameterized messages. English source
  messages are the fallback catalog. Add Korean translations in `src/i18n/ko.ts`
  with exactly the same source key and placeholder names; translations can reorder
  placeholders or omit English plural suffixes.
- Use `ui(value)` at render boundaries for data-driven copy. For messages stored
  in component state, preserve their source with `message(source, values)` and
  compose them with `joinMessages(parts)`. Render them through `ui()` so switching
  language also updates an existing status message.
- Use `formatNumber(value, options)` or `formatDecimal(value, digits)` for display
  numbers. Resolve optional values and defaults **before** formatting. Do not
  localize numeric input values, CSS dimensions, coordinates used by code, or
  serialized data.
- Keep canonical game identifiers, item/strategy names, import text, search
  expressions, URLs, and date identifiers unchanged. Interface language is
  independent of the existing in-game search-client language setting.

Korean covers primary navigation, library/import controls, board controls, common
actions and diagnostics. Detailed game explanations, research prose, changelog
entries, and messages without a Korean entry retain their exact English source.
This is a deliberate fallback, not a claim that every game term has a verified
Korean translation. Both visible text and accessible labels use the same layer;
there is no DOM text rewriting or HTML interpretation of translations.

The rolling-regex and Windows OCR instructions load independently when their
native details disclosures first open. Their summaries and the main importer
remain available immediately. The help subtree stays mounted after closing, so
reopening keeps nested FAQ state and does not request the chunk again. A localized
loading status and an isolated error boundary keep optional help loading or
failure from interrupting chart imports.
The one-time importer-update notice likewise keeps its modal shell, title, focus
and close action available while its instructional body loads only when shown.

`src/i18n/locale.test.tsx` checks locale resolution, blocked storage, metadata,
fallback text, interpolation, number formatting, accessible controls, and stored
message changes. `e2e/localization.spec.ts` checks Korean imports and live language
switching with state preservation, reload persistence, and unsupported-browser
fallback in Chromium.
