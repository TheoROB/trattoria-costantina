// Pure state machines behind the two counted entry points (no DOM here, so they are unit tested).
//
// A "demande de réservation" is counted only once the DISH iframe has fired `load` AND is visible to the visitor.
// Limit: DISH is cross-origin, so `load` only says the frame finished loading *a* document. A network failure or a
// DISH error still ends with the browser's own error page firing `load` (Chrome), and nothing in the parent can tell
// the two apart: no readable content, no documented postMessage (see evidence/dish-audit.md). It never means a
// reservation was made. What `load` does rule out: an opening closed or scrolled away before the frame finished.

export type Report = () => void

/** Floating button + modal. One count per opening, once the iframe has loaded while that opening is still on. */
export function createModalOpening(report: Report) {
  let iframeLoaded = false
  let pending = false // an opening is on screen and not counted yet

  return {
    /** The dialog was actually shown. */
    opened() {
      if (iframeLoaded) report() // iframe kept from an earlier opening: visible and loaded right away
      else pending = true
    },
    /** The dialog closed: an opening still waiting for the iframe is dropped, never counted later. */
    closed() {
      pending = false
    },
    /** `load` of the iframe. DISH navigating inside the frame fires it again: only the first one per opening counts. */
    loaded() {
      iframeLoaded = true
      if (pending) {
        pending = false
        report()
      }
    },
  }
}

export type InlineState = {
  /** The iframe fired `load` (or was found already loaded). */
  loaded: boolean
  /** Enough of the iframe is inside the viewport. */
  inView: boolean
  /** Not intersecting at all: the next appearance is a new opening. */
  offScreen: boolean
  tabVisible: boolean
  /** Covered by the open mobile menu or by a modal dialog. */
  occluded: boolean
}

export type Timers = {
  set: (fn: () => void, ms: number) => unknown
  clear: (id: unknown) => void
}

/** Inline widget: counts once it has been loaded, in view, in a visible tab and uncovered for `dwellMs` in a row. */
export function createInlineDwell(report: Report, dwellMs: number, timers: Timers) {
  const state: InlineState = { loaded: false, inView: false, offScreen: true, tabVisible: true, occluded: false }
  let counted = false
  let timer: unknown

  const stop = () => {
    if (timer !== undefined) timers.clear(timer)
    timer = undefined
  }

  return {
    update(patch: Partial<InlineState>) {
      Object.assign(state, patch)
      if (state.offScreen) counted = false
      const showing = state.loaded && state.inView && state.tabVisible && !state.occluded
      if (!showing || counted) return stop()
      // Already waiting: an unrelated update (re-render, observer threshold) neither restarts nor doubles the timer.
      timer ??= timers.set(() => {
        timer = undefined
        counted = true
        report()
      }, dwellMs)
    },
    dispose: stop,
  }
}

/** Something drawn above the page hides the inline widget: an open modal <dialog>, or the open mobile menu. */
export type OverlayProbe = {
  openModal: boolean
  /** `aria-expanded` of the navbar menu toggle, and whether the toggle is displayed (mobile layout only). */
  menuExpanded: boolean
  menuToggleDisplayed: boolean
}

export function isOccluded(probe: OverlayProbe) {
  return probe.openModal || (probe.menuExpanded && probe.menuToggleDisplayed)
}

/** Resource Timing reports an iframe navigation in the parent when its `load` fires: lets a tracker that mounted
 *  after `load` (hydration after a fast load) still know. Returns false when unsure: the event listener stays on. */
export function loadedBeforeMount(src: string, entries: readonly { name: string; initiatorType: string }[]) {
  return entries.some((e) => e.initiatorType === 'iframe' && e.name === src)
}
