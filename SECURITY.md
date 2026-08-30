# Security Policy

## Supported Version

Security fixes are made on `main` and released through the latest GitHub Pages deployment. Older deployments and local checkouts are not maintained separately.

## Reporting a Vulnerability

[Report a vulnerability privately](https://github.com/Alkwer/one-more-map.github.io/security/advisories/new) through the maintained repository's GitHub Security Advisories. Private vulnerability reporting is enabled for external reporters. Use a public issue only when the report contains no sensitive details or practical exploit information.

Include the affected surface, reproduction conditions, expected impact, and the revision or deployment you tested. Do not include account data, private submission keys, or Path of Exile screenshots containing personal information.

The application footer shows the deployed seven-character commit SHA and UTC build
timestamp. Select the SHA to open the exact commit in this repository. The full SHA
and the same timestamp are also published in `deployment.json` beside the app and
included in Feedback links. CI injects `GITHUB_SHA` when Vite builds the artifact;
the identifier names that deployed commit, not the package version. Local builds
without `GITHUB_SHA` explicitly show `local (development)` and cannot identify a
published revision. Never put security details into the public Feedback form.

## Dependency Advisory Triage

The repository owner, [@Alkwer](https://github.com/Alkwer), owns initial triage for Dependabot alerts and security-update pull requests.

- Critical and high-severity advisories are reviewed within two business days.
- Moderate and low-severity advisories are reviewed within five business days.
- A review records whether the dependency is reachable in the production build, the supported remediation, and any temporary mitigation.
- Remediation pull requests run `npm run audit:ci` and the normal repository validation before merge.

Dependabot vulnerability alerts and security updates provide event-driven coverage. The scheduled dependency-security workflow also runs the audit policy weekly, independently of code pushes and dataset-only validation paths.
