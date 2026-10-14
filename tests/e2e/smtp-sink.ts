import net from 'node:net'

// Minimal local SMTP server for the contact e2e tests: accepts any credentials and keeps the raw
// messages in memory. Nothing leaves the machine.
export async function startSmtpSink(port: number) {
  const messages: string[] = []
  const server = net.createServer((socket) => {
    let buffer = ''
    let data: string[] | null = null
    let auth: 'plain' | 'user' | 'pass' | null = null
    const reply = (line: string) => socket.write(`${line}\r\n`)
    reply('220 localhost ESMTP test sink')
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (data) {
          if (line === '.') {
            messages.push(data.join('\n'))
            data = null
            reply('250 OK queued')
          } else data.push(line.startsWith('..') ? line.slice(1) : line)
          continue
        }
        if (auth) {
          auth = auth === 'user' ? 'pass' : null
          reply(auth ? '334 UGFzc3dvcmQ6' : '235 Authentication successful')
          continue
        }
        const command = line.split(' ')[0].toUpperCase()
        if (command === 'EHLO') reply('250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME')
        else if (command === 'HELO') reply('250 localhost')
        else if (command === 'AUTH') {
          const [, mechanism, initial] = line.split(' ')
          if (mechanism.toUpperCase() === 'LOGIN') {
            auth = initial ? 'pass' : 'user'
            reply(initial ? '334 UGFzc3dvcmQ6' : '334 VXNlcm5hbWU6')
          } else if (initial) reply('235 Authentication successful')
          else {
            auth = 'plain'
            reply('334 ')
          }
        } else if (command === 'DATA') {
          data = []
          reply('354 End data with <CR><LF>.<CR><LF>')
        } else if (command === 'QUIT') {
          reply('221 Bye')
          socket.end()
        } else reply('250 OK')
      }
    })
    socket.on('error', () => {})
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return { messages, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}
