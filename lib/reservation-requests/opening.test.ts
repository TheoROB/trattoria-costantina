import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInlineDwell, createModalOpening, isOccluded, loadedBeforeMount } from './opening'

describe('createModalOpening', () => {
  it('waits for the iframe load: an opening counts when load comes later, once', () => {
    const report = vi.fn()
    const modal = createModalOpening(report)
    modal.opened()
    expect(report).not.toHaveBeenCalled()
    modal.loaded()
    expect(report).toHaveBeenCalledTimes(1)
    // DISH navigating inside the frame fires load again: same opening.
    modal.loaded()
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('never counts an opening closed before load, even when load arrives afterwards', () => {
    const report = vi.fn()
    const modal = createModalOpening(report)
    modal.opened()
    modal.closed()
    modal.loaded()
    expect(report).not.toHaveBeenCalled()
  })

  it('a reopening while still loading counts once, at load', () => {
    const report = vi.fn()
    const modal = createModalOpening(report)
    modal.opened()
    modal.closed()
    modal.opened()
    expect(report).not.toHaveBeenCalled()
    modal.loaded()
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('once loaded, every reopening counts right away; closing never counts', () => {
    const report = vi.fn()
    const modal = createModalOpening(report)
    modal.opened()
    modal.loaded()
    modal.closed()
    modal.opened()
    modal.closed()
    modal.opened()
    expect(report).toHaveBeenCalledTimes(3)
    modal.closed()
    expect(report).toHaveBeenCalledTimes(3)
  })

  it('a load with no opening on screen does not count', () => {
    const report = vi.fn()
    createModalOpening(report).loaded()
    expect(report).not.toHaveBeenCalled()
  })
})

describe('createInlineDwell', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = () => {
    const report = vi.fn()
    const dwell = createInlineDwell(report, 1000, {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    })
    return { report, dwell }
  }
  const onScreen = { inView: true, offScreen: false }

  it('in view but not loaded never counts; counts one dwell after a delayed load', () => {
    const { report, dwell } = setup()
    dwell.update(onScreen)
    vi.advanceTimersByTime(5000)
    expect(report).not.toHaveBeenCalled()
    dwell.update({ loaded: true })
    vi.advanceTimersByTime(999)
    expect(report).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('scrolled away before load: nothing, even when load arrives later off screen', () => {
    const { report, dwell } = setup()
    dwell.update(onScreen)
    dwell.update({ inView: false, offScreen: true })
    dwell.update({ loaded: true })
    vi.advanceTimersByTime(5000)
    expect(report).not.toHaveBeenCalled()
  })

  it('repeated updates (re-renders, observer thresholds) neither restart nor double the timer', () => {
    const { report, dwell } = setup()
    dwell.update({ ...onScreen, loaded: true })
    vi.advanceTimersByTime(600)
    dwell.update(onScreen)
    dwell.update({ loaded: true })
    vi.advanceTimersByTime(400)
    expect(report).toHaveBeenCalledTimes(1)
    dwell.update(onScreen)
    vi.advanceTimersByTime(5000)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('an overlay before the first count suspends the timer; it resumes from zero once uncovered, counts once', () => {
    const { report, dwell } = setup()
    dwell.update({ ...onScreen, loaded: true })
    vi.advanceTimersByTime(900)
    dwell.update({ occluded: true })
    vi.advanceTimersByTime(5000)
    expect(report).not.toHaveBeenCalled()
    dwell.update({ occluded: false })
    vi.advanceTimersByTime(999)
    expect(report).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(report).toHaveBeenCalledTimes(1)
    // Covering and uncovering an already counted widget is not a new opening.
    dwell.update({ occluded: true })
    dwell.update({ occluded: false })
    vi.advanceTimersByTime(5000)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('a hidden tab suspends the timer', () => {
    const { report, dwell } = setup()
    dwell.update({ ...onScreen, loaded: true, tabVisible: false })
    vi.advanceTimersByTime(5000)
    expect(report).not.toHaveBeenCalled()
    dwell.update({ tabVisible: true })
    vi.advanceTimersByTime(1000)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('counts again only after leaving the screen entirely; partly visible is the same opening', () => {
    const { report, dwell } = setup()
    dwell.update({ ...onScreen, loaded: true })
    vi.advanceTimersByTime(1000)
    dwell.update({ inView: false, offScreen: false })
    dwell.update(onScreen)
    vi.advanceTimersByTime(5000)
    expect(report).toHaveBeenCalledTimes(1)
    dwell.update({ inView: false, offScreen: true })
    dwell.update(onScreen)
    vi.advanceTimersByTime(1000)
    expect(report).toHaveBeenCalledTimes(2)
  })

  it('dispose clears a pending timer', () => {
    const { report, dwell } = setup()
    dwell.update({ ...onScreen, loaded: true })
    dwell.dispose()
    vi.advanceTimersByTime(5000)
    expect(report).not.toHaveBeenCalled()
  })
})

describe('isOccluded', () => {
  it('an open modal or the displayed, expanded mobile menu covers the page', () => {
    expect(isOccluded({ openModal: true, menuExpanded: false, menuToggleDisplayed: false })).toBe(true)
    expect(isOccluded({ openModal: false, menuExpanded: true, menuToggleDisplayed: true })).toBe(true)
    // Menu left open then resized to desktop: the toggle is gone and the links are an ordinary bar.
    expect(isOccluded({ openModal: false, menuExpanded: true, menuToggleDisplayed: false })).toBe(false)
    expect(isOccluded({ openModal: false, menuExpanded: false, menuToggleDisplayed: true })).toBe(false)
  })
})

describe('loadedBeforeMount', () => {
  const src = 'https://reservation.dish.co/widget/x?a=1'
  it('only an iframe entry for the exact src', () => {
    expect(loadedBeforeMount(src, [{ name: src, initiatorType: 'iframe' }])).toBe(true)
    expect(loadedBeforeMount(src, [{ name: src, initiatorType: 'img' }])).toBe(false)
    expect(loadedBeforeMount(src, [{ name: 'https://reservation.dish.co/widget/y', initiatorType: 'iframe' }])).toBe(false)
    expect(loadedBeforeMount(src, [])).toBe(false)
  })
})
