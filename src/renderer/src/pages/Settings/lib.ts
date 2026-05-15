// Settings — shared helpers (accelerator formatting, tooltip copy).
//
// Kept React-free so the unit tests can exercise the formatting helpers
// without bringing in jsdom.

/** Convert a DOM KeyboardEvent to an Electron accelerator string.
 *  Returns null if the combo isn't usable (modifier-only, no modifier, unmapped key). */
export function keyEventToAccelerator(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (parts.length === 0) return null // bare key — require at least one modifier

  let key = e.key
  if (key.length === 1) {
    key = key.toUpperCase()
  } else {
    const MAP: Record<string, string> = {
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      Escape: 'Escape', Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace',
      Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
      Insert: 'Insert', ' ': 'Space',
      F1:'F1',F2:'F2',F3:'F3',F4:'F4',F5:'F5',F6:'F6',
      F7:'F7',F8:'F8',F9:'F9',F10:'F10',F11:'F11',F12:'F12',
    }
    const mapped = MAP[key]
    if (!mapped) return null
    key = mapped
  }

  parts.push(key)
  return parts.join('+')
}

/** Pretty-print an Electron accelerator (`CommandOrControl+Shift+L` → `Ctrl + Shift + L`). */
export function formatAccelerator(accel: string): string {
  return accel.replace('CommandOrControl', 'Ctrl').split('+').join(' + ')
}

// ── Tooltip copy ──────────────────────────────────────────────────────────────
//
// One-liner descriptions surfaced via the native `title` attribute on overlay
// toggles.  Kept centralised so the wording stays consistent across the matrix
// and so future copy edits don't require chasing JSX.

/** Per-overlay one-liners shown next to the overlay name. */
export const OVERLAY_DESCRIPTIONS = {
  gauges: 'Bottom-centre HUD: RPM bar, input trace, gear, speed, delta to best lap, fuel, TC/ABS dials.',
  tireTemps: 'Per-corner contact-patch temps with hot/cold colouring. Requires a car that exposes live surface temps.',
  relative: 'Proximity list of cars around you: position, gap, iRating, Safety Rating, position delta, estimated iR change, closing rate, side indicator.',
  pitStrategy: 'Fuel calc, in-stint tire-deg trend, recommended pit window.',
  radar: 'Track-relative dots for cars within ±1s, with amber edge highlights when a car is alongside.',
} as const

/** Per-element / per-column tooltip copy, keyed by `<overlay>.<element>`. */
export const ELEMENT_DESCRIPTIONS: Record<string, string> = {
  // Gauges elements
  'gauges.rpmBar':     'Coloured RPM bar across the top — green / yellow / red zones, with shift-point marker.',
  'gauges.inputTrace': 'Rolling 5-second trace of throttle and brake pedal positions.',
  'gauges.gear':       'Current gear, large and centred.',
  'gauges.speed':      'Current speed (mph or kph based on iRacing setting).',
  'gauges.delta':      'Delta to your best lap of the session — green = ahead, red = behind.',
  'gauges.fuel':       'Remaining fuel in litres.',
  'gauges.tc':         'Traction control dial setting; flashes when TC is intervening.',
  'gauges.abs':        'ABS dial setting; flashes when ABS is intervening.',

  // Relative columns
  'relative.iRating':       'Driver iRating shown next to their name.',
  'relative.safetyRating':  'Safety Rating sub-level with a color-coded letter+icon badge (red / yellow / green / blue).',
  'relative.positionDelta': 'Position change vs. start of the session (e.g. +3 / −2).',
  'relative.irChange':      'Estimated iRating change at the current finishing order (Elo-style approximation; race sessions only).',
  'relative.closingRate':   'How fast the gap is closing or opening, in seconds per lap. Least-squares regression over an 8-second window.',
  'relative.carLeftRight':  'Amber chevrons next to your car number whenever iRacing flags a car alongside you (CarLeftRight proximity).',

  // Pit Strategy sections
  'pitStrategy.fuel':      'Current fuel + per-lap usage + laps remaining at present pace.',
  'pitStrategy.tireDeg':   'In-stint pace trend: last lap vs. rolling-average of the prior 3, plus delta vs. stint best.',
  'pitStrategy.pitWindow': 'Recommended lap to pit based on fuel remaining and stops left in the session.',
}
