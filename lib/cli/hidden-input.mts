// Hidden terminal input for scripts/admin-user.mts. Plain .mts without `server-only` so the script can import it.
//
// Never iterate process.stdin with `for await`: leaving the loop calls the iterator's return(), which
// destroys the stream, and the next read then fails with AbortError. Listeners leave stdin usable.
import type { Readable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'

// process.stdin when it is a terminal.
export type RawInput = Readable & { setRawMode(mode: boolean): unknown }
export interface Output {
  write(text: string): unknown
}

export class PromptCancelledError extends Error {
  constructor() {
    super('Cancelled')
  }
}

const CTRL_C = '\u0003'
const CTRL_D = '\u0004'
const BACKSPACE = new Set(['\u007f', '\b'])

// Echoes nothing. Raw mode is always switched off again, whether the read ends, is cancelled or fails.
export function readHidden(prompt: string, input: RawInput, output: Output) {
  return new Promise<string>((resolve, reject) => {
    const decoder = new StringDecoder('utf8')
    let value = ''

    const finish = (rest: Buffer | null, settle: () => void) => {
      input.off('data', onData)
      input.off('end', onEnd)
      input.off('close', onEnd)
      input.off('error', onError)
      input.setRawMode(false)
      input.pause()
      // Keys typed (or pasted) after Enter belong to the next read.
      if (rest && rest.length > 0) input.unshift(rest)
      output.write('\n')
      settle()
    }
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      for (let i = 0; i < bytes.length; i++) {
        for (const char of decoder.write(bytes.subarray(i, i + 1))) {
          if (char === '\r' || char === '\n') return finish(bytes.subarray(i + 1), () => resolve(value))
          if (char === CTRL_C || char === CTRL_D) return finish(null, () => reject(new PromptCancelledError()))
          value = BACKSPACE.has(char) ? value.slice(0, -1) : value + char
        }
      }
    }
    const onEnd = () => finish(null, () => reject(new PromptCancelledError()))
    const onError = (error: Error) => finish(null, () => reject(error))

    output.write(prompt)
    input.on('data', onData)
    input.on('end', onEnd)
    input.on('close', onEnd)
    input.on('error', onError)
    try {
      input.setRawMode(true)
      input.resume()
    } catch (error) {
      finish(null, () => reject(error))
    }
  })
}

// Returns null when the two entries differ.
export async function readConfirmedPassword(input: RawInput, output: Output) {
  const first = await readHidden('New password: ', input, output)
  const second = await readHidden('Repeat password: ', input, output)
  return first === second ? first : null
}
