import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  BORDER_ROLL_COMMENT_MARKER,
  isTrustedBorderRollValidationComment,
} from './border-roll-validation-comment.mjs'

export { BORDER_ROLL_COMMENT_MARKER }

const requestJson = async (fetchImpl, url, token, options = {}) => {
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(
      `GitHub API request failed (${response.status} ${response.statusText}): ${details}`,
    )
  }

  return response.status === 204 ? null : response.json()
}

export const upsertBorderRollComment = async ({
  apiUrl = 'https://api.github.com',
  repository,
  issueNumber,
  token,
  body,
  fetchImpl = fetch,
}) => {
  if (!repository || !Number.isInteger(issueNumber) || !token) {
    throw new Error('repository, integer issueNumber, and token are required')
  }
  if (typeof body !== 'string' || !body.includes(BORDER_ROLL_COMMENT_MARKER)) {
    throw new Error('Refusing to publish a validation comment without its stable marker')
  }

  const encodedRepository = repository.split('/').map(encodeURIComponent).join('/')
  const issueCommentsUrl = `${apiUrl}/repos/${encodedRepository}/issues/${issueNumber}/comments`
  const validationComments = []

  for (let page = 1; ; page += 1) {
    const comments = await requestJson(
      fetchImpl,
      `${issueCommentsUrl}?per_page=100&page=${page}`,
      token,
    )
    if (!Array.isArray(comments)) throw new Error('GitHub returned a non-array comments response')

    validationComments.push(...comments.filter(isTrustedBorderRollValidationComment))
    if (comments.length < 100) break
  }

  if (validationComments.length > 1) {
    throw new Error('Refusing to update ambiguous trusted validation comments')
  }
  const validationComment = validationComments[0] ?? null

  if (validationComment) {
    await requestJson(
      fetchImpl,
      `${apiUrl}/repos/${encodedRepository}/issues/comments/${validationComment.id}`,
      token,
      { method: 'PATCH', body: JSON.stringify({ body }) },
    )
    return { action: 'updated', commentId: validationComment.id }
  }

  const created = await requestJson(fetchImpl, issueCommentsUrl, token, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
  return { action: 'created', commentId: created?.id ?? null }
}

const isCliEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isCliEntryPoint) {
  const commentPath = process.argv[2]
  if (!commentPath) throw new Error('Usage: upsert-border-roll-comment COMMENT_FILE')

  const result = await upsertBorderRollComment({
    apiUrl: process.env.GITHUB_API_URL,
    repository: process.env.GITHUB_REPOSITORY,
    issueNumber: Number(process.env.ISSUE_NUMBER),
    token: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN,
    body: await readFile(commentPath, 'utf8'),
  })
  console.log(`${result.action} border-roll validation comment ${result.commentId ?? ''}`.trim())
}
