import type { Stat } from '../types'

const PATHS: Record<Stat, JSX.Element> = {
  // coin stack
  currency: (
    <>
      <ellipse cx="8" cy="4.2" rx="5" ry="2.2" />
      <path d="M3 4.2v3.8c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V4.2" />
      <path d="M3 8v3.8c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V8" />
    </>
  ),
  // scarab beetle
  scarabs: (
    <>
      <circle cx="8" cy="9.2" r="4.2" />
      <circle cx="8" cy="3.6" r="1.6" />
      <path d="M8 5.2v8M4.2 7.2 2 5.5M11.8 7.2 14 5.5M4 11l-2 1.2M12 11l2 1.2" />
    </>
  ),
  // skull
  rares: (
    <>
      <path d="M8 1.8a4.6 4.6 0 0 0-4.6 4.6c0 1.9 1.1 3.4 2.6 4.1v2.7h4V10.5c1.5-.7 2.6-2.2 2.6-4.1A4.6 4.6 0 0 0 8 1.8z" />
      <circle cx="6.2" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.8" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  // sulphur droplet
  sulphur: <path d="M8 1.8S4 7 4 9.6a4 4 0 0 0 8 0C12 7 8 1.8 8 1.8z" />,
  // monster pack
  packsize: (
    <>
      <circle cx="4.8" cy="5" r="2.1" />
      <circle cx="11.2" cy="5" r="2.1" />
      <circle cx="8" cy="10.6" r="2.1" />
    </>
  ),
  // loot chest
  quantity: (
    <>
      <rect x="2.8" y="6.4" width="10.4" height="6.8" rx="1" />
      <path d="M2.8 6.4c0-2.2 2.3-3.6 5.2-3.6s5.2 1.4 5.2 3.6" />
      <path d="M8 6.4v2.4" />
    </>
  ),
  // shield (chart preservation)
  preserve: <path d="M8 1.8l5 1.9v4.2c0 3.4-2.1 5.4-5 6.5-2.9-1.1-5-3.1-5-6.5V3.7l5-1.9z" />,
}

export function StatIcon({ stat, size = 13 }: { stat: Stat; size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[stat]}
    </svg>
  )
}
