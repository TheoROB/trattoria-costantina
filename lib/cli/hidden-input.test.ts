import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { PromptCancelledError, readConfirmedPassword, readHidden } from './hidden-input.mts'

// A real stream, like process.stdin, plus the TTY raw mode switch.
class FakeTty extends PassThrough {
  isRaw = false
  rawModes: boolean[] = []
  setRawMode(mode: boolean) {
    this.isRaw = mode
    this.rawModes.push(mode)
    return this
  }
  type(text: string) {
    this.write(Buffer.from(text))
  }
}

function setup() {
  const input = new FakeTty()
  let printed = ''
  const output = { write: (text: string) => (printed += text) }
  return { input, output, printed: () => printed }
}

// Lets the stream deliver what was typed before the next keystrokes are sent.
const tick = () => new Promise((resolve) => setImmediate(resolve))

describe('readHidden', () => {
  it('reads two entries in a row from the same stream without destroying it', async () => {
    const { input, output } = setup()
    const first = readHidden('A: ', input, output)
    input.type('first-secret\r')
    expect(await first).toBe('first-secret')
    expect(input.destroyed).toBe(false)

    const second = readHidden('B: ', input, output)
    input.type('second-secret\n')
    expect(await second).toBe('second-secret')
    expect(input.destroyed).toBe(false)
  })

  it('handles backspace, multi-byte characters split across chunks and keystrokes typed after Enter', async () => {
    const { input, output } = setup()
    const euro = Buffer.from('€')
    const first = readHidden('A: ', input, output)
    input.type('abcx\u007f')
    await tick()
    input.write(euro.subarray(0, 1))
    await tick()
    input.write(Buffer.concat([euro.subarray(1), Buffer.from('\rnext-entry\r')]))
    expect(await first).toBe('abc€')
    expect(await readHidden('B: ', input, output)).toBe('next-entry')
  })

  it.each([
    ['Ctrl+C', '\u0003'],
    ['Ctrl+D', '\u0004'],
  ])('is cancelled by %s and restores the terminal', async (_name, key) => {
    const { input, output } = setup()
    const read = readHidden('A: ', input, output)
    input.type(`partial${key}`)
    await expect(read).rejects.toBeInstanceOf(PromptCancelledError)
    expect(input.rawModes).toEqual([true, false])
    expect(input.isPaused()).toBe(true)
  })

  it('is cancelled when stdin reaches end of file, and restores the terminal', async () => {
    const { input, output } = setup()
    const read = readHidden('A: ', input, output)
    input.end('partial')
    await expect(read).rejects.toBeInstanceOf(PromptCancelledError)
    expect(input.isRaw).toBe(false)
  })

  it('rejects with the stream error and restores the terminal', async () => {
    const { input, output } = setup()
    const read = readHidden('A: ', input, output)
    input.destroy(new Error('EIO'))
    await expect(read).rejects.toThrow('EIO')
    expect(input.isRaw).toBe(false)
  })

  it('restores the terminal after every successful read', async () => {
    const { input, output } = setup()
    const read = readHidden('A: ', input, output)
    input.type('secret-value\r')
    await read
    expect(input.rawModes).toEqual([true, false])
    expect(input.isPaused()).toBe(true)
  })
})

describe('readConfirmedPassword', () => {
  it('returns the password when both entries match', async () => {
    const { input, output, printed } = setup()
    const read = readConfirmedPassword(input, output)
    input.type('correct-horse-battery\r')
    await tick()
    input.type('correct-horse-battery\r')
    expect(await read).toBe('correct-horse-battery')
    expect(printed()).toBe('New password: \nRepeat password: \n')
  })

  it('returns null when the entries differ', async () => {
    const { input, output } = setup()
    const read = readConfirmedPassword(input, output)
    input.type('correct-horse-battery\r')
    await tick()
    input.type('correct-horse-batterz\r')
    expect(await read).toBeNull()
    expect(input.isRaw).toBe(false)
  })

  it('accepts both entries pasted at once', async () => {
    const { input, output } = setup()
    const read = readConfirmedPassword(input, output)
    input.type('pasted-password-1\rpasted-password-1\r')
    expect(await read).toBe('pasted-password-1')
  })

  it('never prints the password, whatever the outcome', async () => {
    const secret = 'never-shown-Secret-42'
    for (const [firstEntry, secondEntry] of [
      [secret, secret],
      [secret, `${secret}x`],
      [secret, '\u0003'],
    ]) {
      const { input, output, printed } = setup()
      const read = readConfirmedPassword(input, output)
      input.type(`${firstEntry}\r`)
      await tick()
      input.type(secondEntry.endsWith('\u0003') ? secondEntry : `${secondEntry}\r`)
      await read.catch((error: Error) => expect(error.message).not.toContain('never-shown'))
      expect(printed()).not.toContain('never-shown')
    }
  })
})
