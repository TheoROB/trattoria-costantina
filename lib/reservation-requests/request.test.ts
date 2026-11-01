import { describe, expect, it } from 'vitest'
import { checkHeaders, MAX_BODY_BYTES, parseBody, readBoundedText } from './request'
import { TRACKED_PATHS } from './paths'

const ORIGIN = 'https://trattoriacostantina.fr'
const headers = (values: Record<string, string>) =>
  new Headers({ origin: ORIGIN, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...values })

describe('checkHeaders', () => {
  it('accepts a same-origin JSON request', () => {
    expect(checkHeaders(headers({}), ORIGIN)).toBeNull()
    expect(checkHeaders(headers({ 'content-type': 'application/json; charset=UTF-8' }), ORIGIN)).toBeNull()
    const noFetchMetadata = headers({})
    noFetchMetadata.delete('sec-fetch-site')
    expect(checkHeaders(noFetchMetadata, ORIGIN)).toBeNull()
  })

  it('refuses any other origin, a missing one, or a cross-site fetch', () => {
    const missing = headers({})
    missing.delete('origin')
    expect(checkHeaders(missing, ORIGIN)).toBe('forbidden')
    expect(checkHeaders(headers({ origin: 'https://evil.example' }), ORIGIN)).toBe('forbidden')
    expect(checkHeaders(headers({ origin: 'null' }), ORIGIN)).toBe('forbidden')
    expect(checkHeaders(headers({ origin: `${ORIGIN}.evil.example` }), ORIGIN)).toBe('forbidden')
    expect(checkHeaders(headers({ 'sec-fetch-site': 'cross-site' }), ORIGIN)).toBe('forbidden')
    expect(checkHeaders(headers({ 'sec-fetch-site': 'same-site' }), ORIGIN)).toBe('forbidden')
  })

  it('refuses other content types and declared bodies over the cap', () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonp']) {
      expect(checkHeaders(headers({ 'content-type': type }), ORIGIN)).toBe('unsupported_media_type')
    }
    expect(checkHeaders(headers({ 'content-length': String(MAX_BODY_BYTES + 1) }), ORIGIN)).toBe('too_large')
    expect(checkHeaders(headers({ 'content-length': 'abc' }), ORIGIN)).toBe('too_large')
    expect(checkHeaders(headers({ 'content-length': '28' }), ORIGIN)).toBeNull()
  })
})

describe('parseBody', () => {
  it.each(TRACKED_PATHS)('accepts %s', (path) => {
    expect(parseBody(JSON.stringify({ path }))).toBe(path)
  })

  it.each([
    '',
    'null',
    '[]',
    '"/"',
    '{}',
    '{"path":"/carte?utm=1"}',
    '{"path":"/carte#reservation"}',
    '{"path":"/admin"}',
    '{"path":"/carte/"}',
    '{"path":"https://trattoriacostantina.fr/carte"}',
    '{"path":1}',
    '{"path":"/","session":"abc"}',
    '{"path":"/","email":"a@b.c"}',
    '{"Path":"/"}',
    '{"path":"/"',
  ])('rejects %s', (body) => {
    expect(parseBody(body)).toBeNull()
  })
})

describe('readBoundedText', () => {
  const request = (body: BodyInit | null) => new Request('https://x.test/', { method: 'POST', body, duplex: 'half' } as RequestInit)

  it('reads a small body', async () => {
    expect(await readBoundedText(request('{"path":"/"}'))).toBe('{"path":"/"}')
    expect(await readBoundedText(request(null))).toBe('')
  })

  it('stops past the cap whatever the headers say', async () => {
    expect(await readBoundedText(request('x'.repeat(MAX_BODY_BYTES + 1)))).toBeNull()
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(64))
      },
    })
    expect(await readBoundedText(request(stream))).toBeNull()
  })

  it('treats invalid UTF-8 as an empty (rejected) body', async () => {
    expect(await readBoundedText(request(new Uint8Array([0xff, 0xfe])))).toBe('')
  })
})
