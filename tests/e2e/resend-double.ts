import http from 'node:http'

export type ResendRequest = { authorization: string | undefined; userAgent: string | undefined; body: Record<string, unknown> }

// Minimal local stand-in for POST https://api.resend.com/emails, reached through RESEND_BASE_URL
// (loopback only, see lib/contact/mail.ts). Keeps the requests in memory: nothing leaves the machine.
export async function startResendDouble(port: number) {
  const requests: ResendRequest[] = []
  const server = http.createServer((request, response) => {
    let raw = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => (raw += chunk))
    request.on('end', () => {
      response.setHeader('Content-Type', 'application/json')
      if (request.method !== 'POST' || request.url !== '/emails') {
        response.writeHead(404).end(JSON.stringify({ statusCode: 404, name: 'not_found', message: 'Not found' }))
        return
      }
      requests.push({ authorization: request.headers.authorization, userAgent: request.headers['user-agent'], body: JSON.parse(raw) })
      response.writeHead(200).end(JSON.stringify({ id: `e2e-${requests.length}` }))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return { requests, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}
