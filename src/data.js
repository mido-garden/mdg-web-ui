/** Default reminder-channel settings (Track view). Not seed garden content. */
export const DEFAULT_SETTINGS = {
  channels: { push: true, email: true, telegram: true, slack: false },
  quietFrom: '22:00',
  quietTo: '07:00',
  mapCols: 3,
}

/** Light repair for tempo rows (no sample refill). */
export function settleTempos(tempos) {
  if (!Array.isArray(tempos)) return []
  return tempos.map((t) => (Array.isArray(t.tags) ? t : { ...t, tags: [] }))
}
