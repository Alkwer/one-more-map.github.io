export const BORDER_ROLL_COMMENT_MARKER = '<!-- border-roll-validation -->'

// GitHub Actions comments are issued by this immutable bot/App identity. Because
// comments are fetched from this repository's issue endpoint, the App token that
// created them was necessarily authorized by this repository's installation.
const GITHUB_ACTIONS_BOT_ID = 41_898_282
const GITHUB_ACTIONS_APP_ID = 15_368

export const isTrustedBorderRollValidationComment = (comment) =>
  Number.isSafeInteger(comment?.id) &&
  comment.id > 0 &&
  comment?.user?.id === GITHUB_ACTIONS_BOT_ID &&
  comment.user.login === 'github-actions[bot]' &&
  comment.user.type === 'Bot' &&
  comment?.performed_via_github_app?.id === GITHUB_ACTIONS_APP_ID &&
  comment.performed_via_github_app.slug === 'github-actions' &&
  typeof comment.body === 'string' &&
  comment.body.includes(BORDER_ROLL_COMMENT_MARKER)
