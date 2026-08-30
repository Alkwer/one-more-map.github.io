export function resolveBuildIdentity(env: Record<string, string | undefined>, now = new Date()) {
  const commit = env.GITHUB_SHA?.trim() || 'local'
  if (commit !== 'local' && !/^[a-f0-9]{40}$/i.test(commit)) {
    throw new Error('GITHUB_SHA must be a full 40-character commit SHA')
  }
  return { commit, shortCommit: commit.slice(0, 7), builtAt: now.toISOString() }
}
