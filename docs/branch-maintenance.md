# Branch maintenance

This repository is maintained as an independent fork. Branch maintenance applies
only to `origin` (`Alkwer/one-more-map.github.io`). It does not fetch, merge,
rebase, or otherwise synchronize `upstream`.

## Ownership and cadence

Repository maintainers own the remote branch inventory. Review it monthly and
whenever more than ten feature branches remain on `origin`. The author of a
branch should open a pull request promptly and remove the branch when the work is
abandoned.

GitHub's **Automatically delete head branches** setting is enabled. A pull
request head is therefore removed automatically after merge while its commits,
discussion, and review history remain available through the pull request.

## Naming and retention

- Use `agent/<issue-or-short-description>` or
  `codex/<issue-or-short-description>` for task branches. Include the issue
  number when one exists.
- Use `automation/<workflow>-<run-id>` for disposable workflow-created branches.
- Do not reuse a merged branch name for new work. Start a new branch from the
  current `origin/main` instead.
- Retain a branch while it has an open pull request or commits that have not been
  integrated into `main`.
- Delete a branch after its pull request is merged and only if its current tip is
  still the head SHA recorded by that pull request.
- Preserve ambiguous branches until their owner confirms that they are merged or
  abandoned. Never force-push a shared branch to make cleanup easier.

## Manual audit checklist

1. Refresh only the canonical fork remote:

   ```bash
   git fetch origin --prune
   ```

2. List remote feature branches and the current pull-request heads:

   ```bash
   git for-each-ref --sort=refname \
     --format='%(refname:strip=3) %(objectname)' refs/remotes/origin
   gh pr list --repo Alkwer/one-more-map.github.io --state open \
     --json number,headRefName,headRefOid,url
   ```

3. Find an exact merged pull request for each deletion candidate:

   ```bash
   gh pr list --repo Alkwer/one-more-map.github.io --state merged --limit 1000 \
     --json number,headRefName,headRefOid,mergedAt,url
   git rev-parse refs/remotes/origin/<branch>
   ```

   A merged pull request is sufficient only when `headRefName` exactly matches
   the candidate and `headRefOid` equals the current remote tip. This protects
   commits pushed after a pull request was merged, including branches merged by
   squash or rebase.

4. Inspect ancestry and commits that are not ancestors of `main`:

   ```bash
   git merge-base --is-ancestor origin/<branch> origin/main
   git log --oneline origin/main..origin/<branch>
   git diff --stat origin/main...origin/<branch>
   ```

   Preserve the branch if it has an open pull request. Also preserve it when it
   has commits outside `main` and no exact, unchanged merged pull request proves
   that the work was integrated.

5. Delete one confirmed branch with an expected-SHA lease:

   ```bash
   git push \
     --force-with-lease=refs/heads/<branch>:<verified-head-sha> \
     origin --delete <branch>
   ```

   The lease makes the deletion fail if the remote tip changed after the audit.
   For a batch, use `git push --atomic` and provide an expected-SHA lease for
   every branch so the batch either succeeds completely or changes nothing.

6. Refresh and verify the result:

   ```bash
   git fetch origin --prune
   git for-each-ref --sort=refname \
     --format='%(refname:strip=3) %(objectname)' refs/remotes/origin
   ```

If any check is inconclusive, keep the branch and record what its owner must
confirm. Branch deletion is not a reason to rewrite history or force-push.

## Audit record: 2026-08-05

The issue #35 audit examined 78 feature branches on `origin` and found no open
pull-request heads. Seventy-four branches exactly matched the recorded head SHA
of a merged pull request and were deleted atomically with expected-SHA leases.

Four branches had no matching merged pull request and contained commits outside
`origin/main`, so they were preserved:

| Branch                                              | Audited tip | Commits outside `main` | Decision |
| --------------------------------------------------- | ----------- | ---------------------: | -------- |
| `agent/border-mod-ocr`                              | `3e80265`   |                      9 | Preserve |
| `agent/upstream-configurable-strategy-reservations` | `fa0c81b`   |                      1 | Preserve |
| `codex/upstream-border-drop-ocr-aliases`            | `795dd99`   |                      1 | Preserve |
| `codex/use-latest-state-for-ocr-import-upstream`    | `6dc031e`   |                      1 | Preserve |

The historic word `upstream` in three branch names does not authorize or imply
upstream synchronization. No upstream fetch, merge, or rebase was performed.

## Recovery

If a merged branch must be restored, read its `headRefOid` from the merged pull
request and recreate the ref from that exact SHA:

```bash
git branch <restored-branch> <headRefOid>
git push origin <restored-branch>
```

Do not use recovery as a substitute for the pre-deletion checks above.
