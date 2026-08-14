import { stat, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const repositoryRoot = dirname(dirname(scriptPath))
const defaultPolicyPath = resolve(repositoryRoot, '.github/asset-size-budget.json')

export function evaluateAssetBudgets(assets, sizes) {
  const failures = []

  for (const [asset, rules] of Object.entries(assets)) {
    const actualBytes = sizes[asset]
    if (!Number.isSafeInteger(rules.maxBytes) || rules.maxBytes <= 0) {
      throw new Error(`${asset}: maxBytes must be a positive integer`)
    }
    if (!Number.isSafeInteger(actualBytes) || actualBytes < 0) {
      failures.push(`${asset}: file is missing`)
      continue
    }
    if (actualBytes > rules.maxBytes) {
      failures.push(`${asset}: ${actualBytes} B exceeds ${rules.maxBytes} B`)
    }
  }

  for (const [asset, rules] of Object.entries(assets)) {
    if (!rules.mustBeSmallerThan || !Number.isSafeInteger(sizes[asset])) continue
    const referenceBytes = sizes[rules.mustBeSmallerThan]
    if (!Number.isSafeInteger(referenceBytes)) {
      failures.push(`${asset}: comparison asset ${rules.mustBeSmallerThan} is missing`)
    } else if (sizes[asset] >= referenceBytes) {
      failures.push(
        `${asset}: ${sizes[asset]} B must be smaller than ${rules.mustBeSmallerThan} (${referenceBytes} B)`,
      )
    }
  }

  return failures
}

export async function checkAssetBudgets({ root = repositoryRoot, policyPath } = {}) {
  const resolvedPolicyPath = policyPath ?? resolve(root, '.github/asset-size-budget.json')
  const policy = JSON.parse(await readFile(resolvedPolicyPath, 'utf8'))
  const assets = policy.assets
  if (!assets || Object.keys(assets).length === 0) {
    throw new Error('Asset size policy must define at least one asset')
  }

  const sizes = {}
  await Promise.all(
    Object.keys(assets).map(async (asset) => {
      try {
        sizes[asset] = (await stat(resolve(root, asset))).size
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
        sizes[asset] = null
      }
    }),
  )

  const failures = evaluateAssetBudgets(assets, sizes)
  if (failures.length > 0) {
    throw new Error(`Asset size budget failed:\n- ${failures.join('\n- ')}`)
  }

  return { assets, sizes }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const { assets, sizes } = await checkAssetBudgets({ policyPath: defaultPolicyPath })
    for (const [asset, rules] of Object.entries(assets)) {
      console.log(`${asset}: ${sizes[asset]} B / ${rules.maxBytes} B`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
