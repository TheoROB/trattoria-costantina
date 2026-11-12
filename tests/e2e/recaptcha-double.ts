import http from 'node:http'
import type { Page } from '@playwright/test'

export type AssessmentRequest = { apiKey: string | undefined; url: string | undefined; body: { event?: Record<string, unknown> } }

// Minimal local stand-in for POST https://recaptchaenterprise.googleapis.com/v1/projects/<id>/assessments, reached
// through RECAPTCHA_API_BASE_URL (loopback only, see lib/contact/recaptcha.ts). Nothing leaves the machine. `score`
// can be changed by a test; the token is valid when it is the one served by stubEnterpriseScript.
export async function startRecaptchaDouble(port: number, hostname: string) {
  const requests: AssessmentRequest[] = []
  const state = { score: 0.9, requests }
  const server = http.createServer((request, response) => {
    let raw = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => (raw += chunk))
    request.on('end', () => {
      response.setHeader('Content-Type', 'application/json')
      if (request.method !== 'POST' || !/^\/v1\/projects\/[a-z0-9-]+\/assessments$/.test(request.url ?? '')) {
        response.writeHead(404).end(JSON.stringify({ error: { code: 404, status: 'NOT_FOUND' } }))
        return
      }
      const body = JSON.parse(raw)
      requests.push({ apiKey: request.headers['x-goog-api-key'] as string | undefined, url: request.url, body })
      const token = body.event?.token
      const valid = typeof token === 'string' && token.startsWith('e2e-token-')
      response.writeHead(200).end(
        JSON.stringify({
          tokenProperties: {
            valid,
            invalidReason: valid ? 'INVALID_REASON_UNSPECIFIED' : 'MALFORMED',
            hostname,
            action: valid ? token.slice('e2e-token-'.length) : '',
          },
          riskAnalysis: { score: valid ? state.score : 0, reasons: [] },
        }),
      )
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return { state, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

// Replaces Google's enterprise.js in the page: the token names the action it was requested for.
export async function stubEnterpriseScript(page: Page) {
  const executed: string[] = []
  await page.exposeFunction('__recaptchaExecuted', (action: string) => void executed.push(action))
  await page.route('https://www.recaptcha.net/recaptcha/enterprise.js*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.grecaptcha = { enterprise: {
        ready: (callback) => callback(),
        execute: async (siteKey, { action }) => { await window.__recaptchaExecuted(action); return 'e2e-token-' + action },
      } }`,
    }),
  )
  return executed
}
