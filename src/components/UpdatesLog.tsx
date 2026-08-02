import { UPDATES } from '../data/updates'

interface Props {
  onClose: () => void
}

/** Overlay listing NEW / REWORKED site updates (no bug fixes) - newest first. */
export function UpdatesLog({ onClose }: Props) {
  return (
    <div className="onboard-backdrop" onClick={onClose}>
      <div className="onboard updates-log" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          Updates
          <span className="spacer" />
          <button onClick={onClose}>Done</button>
        </div>
        <p className="onboard-intro" style={{ marginBottom: 10 }}>
          What's new and what changed - fresh additions and reworks only.
        </p>
        <div className="updates-list">
          {UPDATES.map((u) => (
            <div key={`${u.date}-${u.title}`} className="update-row">
              <div className="update-head">
                <span className={`update-tag tag-${u.tag}`}>
                  {u.tag === 'new' ? 'NEW' : 'REWORKED'}
                </span>
                <span className="update-title">{u.title}</span>
                <span className="spacer" />
                <span className="update-date muted">{u.date}</span>
              </div>
              <div className="update-detail muted">{u.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
