# Security Policy

## Supported Version

Security fixes are made on `main` and released through the latest GitHub Pages deployment. Older deployments and local checkouts are not maintained separately.

## Reporting a Vulnerability

Report vulnerabilities privately through the repository's GitHub Security Advisories. Use a public issue only when the report contains no sensitive details or practical exploit information.

Include the affected surface, reproduction conditions, expected impact, and the revision or deployment you tested. Do not include account data, private submission keys, or Path of Exile screenshots containing personal information.

## Dependency Advisory Triage

The repository owner, [@Alkwer](https://github.com/Alkwer), owns initial triage for Dependabot alerts and security-update pull requests.

- Critical and high-severity advisories are reviewed within two business days.
- Moderate and low-severity advisories are reviewed within five business days.
- A review records whether the dependency is reachable in the production build, the supported remediation, and any temporary mitigation.
- Remediation pull requests run `npm run audit:ci` and the normal repository validation before merge.

Dependabot vulnerability alerts and security updates provide event-driven coverage. The scheduled dependency-security workflow also runs the audit policy weekly, independently of code pushes and dataset-only validation paths.
