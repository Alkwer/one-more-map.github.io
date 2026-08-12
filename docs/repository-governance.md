# Repository governance

`main` is protected by the active repository ruleset declared in
`.github/rulesets/main.json`. Changes require a pull request whose `scope`,
`quality`, and `windows-playwright-exit` checks have completed successfully (a
deliberately skipped Windows check is accepted for canonical dataset-only PRs).
Force pushes and branch deletion are blocked.

The ruleset has no bypass actors. Repository administrators should make an
emergency change by temporarily changing the ruleset through GitHub's audited
settings/API, then restore the checked-in declaration immediately. Do not use a
permanent admin, bot, or GitHub Actions bypass.

The border-roll dataset automation must continue to publish changes through its
managed `automation/border-roll-dataset` pull request. Its workflow must not push
directly to `main`.

After changing repository policy, compare the live ruleset returned by
`GET /repos/Alkwer/one-more-map.github.io/rulesets` with the checked-in JSON and
verify both a rejected direct push and a mergeable green pull request.
