import { request as playwrightRequest, type Page, type Request } from '@playwright/test'
import { SESSION_COOKIE } from './credentials'

export type CapturedAction = {
  url: string
  headers: Record<string, string>
  body: Buffer
}

export type ReplayedActionResponse = {
  status: () => number
  ok: () => boolean
  text: () => Promise<string>
  dispose: () => Promise<void>
}

const ACTION_HEADERS = ['content-type', 'next-action', 'next-router-state-tree'] as const

export async function captureAction(page: Page, trigger: () => Promise<void>): Promise<CapturedAction> {
  let resolveRequest: (request: Request) => void
  const requestCaptured = new Promise<Request>((resolve) => {
    resolveRequest = resolve
  })
  await page.route('**/*', async (route) => {
    const candidate = route.request()
    if (candidate.method() === 'POST' && candidate.headers()['next-action']) {
      resolveRequest(candidate)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })

  try {
    await trigger()
    const capturedRequest = await requestCaptured
    const allHeaders = await capturedRequest.allHeaders()
    const headers = Object.fromEntries(
      ACTION_HEADERS.flatMap((name) => (allHeaders[name] ? [[name, allHeaders[name]]] : [])),
    )
    const body = capturedRequest.postDataBuffer()
    if (!body) throw new Error('The captured Server Action request has no body')
    return { url: capturedRequest.url(), headers, body }
  } finally {
    await page.unroute('**/*')
  }
}

export async function replayAction(
  action: CapturedAction,
  options: {
    baseURL: string
    token?: string
    origin?: string
    body?: Buffer
    method?: 'GET' | 'POST'
  },
): Promise<ReplayedActionResponse> {
  const headers: Record<string, string> = {
    ...action.headers,
    origin: options.origin ?? options.baseURL,
  }
  if (options.token) headers.cookie = `${SESSION_COOKIE}=${options.token}`

  const context = await playwrightRequest.newContext({ baseURL: options.baseURL })
  let response
  try {
    const method = options.method ?? 'POST'
    response =
      method === 'POST'
        ? await context.post(action.url, { headers, data: options.body ?? action.body })
        : await context.get(action.url, { headers })
  } catch (error) {
    await context.dispose()
    throw error
  }

  return {
    status: () => response.status(),
    ok: () => response.ok(),
    text: () => response.text(),
    dispose: async () => {
      await response.dispose()
      await context.dispose()
    },
  }
}

function multipartBoundary(contentType: string) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  return match?.[1] ?? match?.[2]
}

function encodedFieldName(fieldNames: string[], name: string) {
  if (fieldNames.includes(name)) return name
  const encoded = fieldNames.find((candidate) => /^_\d+_/.test(candidate) && candidate.endsWith(`_${name}`))
  if (!encoded) throw new Error(`Missing field ${name} in Server Action body`)
  return encoded
}

function encodedFieldPrefix(fieldNames: string[]) {
  const encoded = fieldNames.find((candidate) => /^_\d+_/.test(candidate))
  const match = encoded?.match(/^(_\d+_)/)
  if (!match) throw new Error('Unable to locate the encoded FormData namespace in Server Action body')
  return match[1]
}

function multipartFieldNames(source: string) {
  return [...source.matchAll(/Content-Disposition: form-data; name="([^"]+)"/g)].map((match) => match[1])
}

function insertMultipartFieldBeforeRoot(source: string, boundary: string, name: string, value: string) {
  const field = `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  const rootHeader = 'Content-Disposition: form-data; name="0"'
  const rootHeaderIndex = source.indexOf(rootHeader)
  if (rootHeaderIndex === -1) throw new Error('Missing React Server Action root part')
  const rootPartIndex = source.lastIndexOf(`--${boundary}`, rootHeaderIndex)
  if (rootPartIndex === -1) throw new Error('Malformed React Server Action root part')
  return Buffer.from(`${source.slice(0, rootPartIndex)}${field}${source.slice(rootPartIndex)}`)
}

export function appendActionField(action: CapturedAction, name: string, value: string) {
  const contentType = action.headers['content-type'] ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(action.body.toString())
    const reordered = new URLSearchParams()
    reordered.append(`${encodedFieldPrefix([...params.keys()])}${name}`, value)
    for (const [key, entryValue] of params) reordered.append(key, entryValue)
    return Buffer.from(reordered.toString())
  }

  const boundary = multipartBoundary(contentType)
  if (!boundary) throw new Error(`Unsupported Server Action content type: ${contentType}`)
  const source = action.body.toString('utf8')
  const encodedName = `${encodedFieldPrefix(multipartFieldNames(source))}${name}`
  return insertMultipartFieldBeforeRoot(source, boundary, encodedName, value)
}

export function replaceActionField(action: CapturedAction, name: string, value: string) {
  const contentType = action.headers['content-type'] ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(action.body.toString())
    const resolvedName = encodedFieldName([...params.keys()], name)
    const reordered = new URLSearchParams()
    reordered.append(resolvedName, value)
    for (const [key, entryValue] of params) {
      if (key !== resolvedName) reordered.append(key, entryValue)
    }
    return Buffer.from(reordered.toString())
  }

  const boundary = multipartBoundary(contentType)
  if (!boundary) throw new Error(`Unsupported Server Action content type: ${contentType}`)
  const source = action.body.toString('utf8')
  const resolvedName = encodedFieldName(multipartFieldNames(source), name)
  const withoutField = removeActionField(action, name)
  return insertMultipartFieldBeforeRoot(withoutField.toString('utf8'), boundary, resolvedName, value)
}

export function removeActionField(action: CapturedAction, name: string) {
  const contentType = action.headers['content-type'] ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(action.body.toString())
    params.delete(encodedFieldName([...params.keys()], name))
    return Buffer.from(params.toString())
  }

  const boundary = multipartBoundary(contentType)
  if (!boundary) throw new Error(`Unsupported Server Action content type: ${contentType}`)
  const source = action.body.toString('utf8')
  const resolvedName = encodedFieldName(multipartFieldNames(source), name)
  const escapedBoundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedName = resolvedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const partPattern = new RegExp(
    `--${escapedBoundary}\\r\\nContent-Disposition: form-data; name="${escapedName}"(?:;[^\\r\\n]*)?\\r\\n(?:Content-Type:[^\\r\\n]+\\r\\n)?\\r\\n[\\s\\S]*?\\r\\n`,
  )
  return Buffer.from(source.replace(partPattern, ''))
}

export async function formFieldName(page: Page, label: string) {
  const name = await page.getByLabel(label).getAttribute('name')
  if (!name) throw new Error(`The ${label} control has no form field name`)
  return name
}
