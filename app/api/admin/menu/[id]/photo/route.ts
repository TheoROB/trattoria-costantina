import { revalidatePath } from 'next/cache'
import { dbErrorCode, getCurrentAdmin } from '@/lib/auth/dal'
import { getPool } from '@/lib/db'
import { MAX_UPLOAD_BYTES } from '@/lib/media/limits'
import { cleanupMenuPhotos, discardMenuPhoto, storeMenuPhoto } from '@/lib/media/menu-photos'
import type { PhotoUploadError } from '@/lib/media/messages'
import { setMenuItemPhoto } from '@/lib/menu/admin'
import { parseItemId } from '@/lib/menu/admin-input'

// Photo upload, kept out of Server Actions so that they keep Next's default 1 MB body limit.
// Only POST is exported: other methods get 405 from Next.js.

// The photo plus multipart boundaries and part headers.
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024

const STATUS: Record<PhotoUploadError | 'unauthorized' | 'forbidden' | 'unsupported_media_type', number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  too_large: 413,
  unsupported_media_type: 415,
  bad_request: 400,
  unsupported: 422,
  heic: 422,
  too_many_pixels: 422,
  too_small: 422,
  corrupt: 422,
  rate_limited: 429,
  failed: 500,
}

const reply = (error: keyof typeof STATUS | null) =>
  Response.json(error ? { error } : { ok: true }, { status: error ? STATUS[error] : 200, headers: { 'Cache-Control': 'no-store' } })

// Route Handlers have no built-in CSRF check (unlike Server Actions): same rule as Next.js applies to
// actions, the Origin host must be the host the request was sent to. A missing Origin is refused.
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host.split(',')[0].trim()
  } catch {
    return false
  }
}

// Reads at most MAX_BODY_BYTES, whatever Content-Length says (it may be absent or wrong).
async function readBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return Buffer.concat(chunks)
    total += value.length
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
}

// Exactly one non-empty file named `photo`, nothing else.
async function parsePhoto(body: Buffer, contentType: string) {
  let form: FormData
  try {
    form = await new Response(new Uint8Array(body), { headers: { 'content-type': contentType } }).formData()
  } catch {
    return null
  }
  const entries = [...form.entries()]
  if (entries.length !== 1) return null
  const [name, value] = entries[0]
  return name === 'photo' && typeof value !== 'string' && value.size > 0 ? value : null
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Nothing is read from the body before the session, origin and size checks.
  const admin = await getCurrentAdmin()
  if (!admin) return reply('unauthorized')
  if (!sameOrigin(request)) return reply('forbidden')
  const id = parseItemId((await params).id)
  if (!id) return reply('not_found')
  const contentType = request.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) return reply('unsupported_media_type')
  const declared = request.headers.get('content-length')
  if (declared !== null && !(Number(declared) <= MAX_BODY_BYTES)) return reply('too_large')

  const body = await readBody(request)
  if (!body) return reply('too_large')
  const file = await parsePhoto(body, contentType)
  if (!file) return reply('bad_request')

  const pool = getPool()
  const stored = await storeMenuPhoto(pool, admin.adminUserId, file)
  if (!stored.ok) return reply(stored.error)

  // Same guarantees as before: the old photo goes only once the new key is committed; on failure the
  // new files go and the old photo stays.
  let result: Awaited<ReturnType<typeof setMenuItemPhoto>>
  try {
    result = await setMenuItemPhoto(pool, admin.adminUserId, id, stored.key)
  } catch (error) {
    console.error(`[admin] set photo failed: ${dbErrorCode(error)}`)
    await discardMenuPhoto(stored.key)
    return reply('failed')
  }
  if (result.status === 'not_found') {
    await discardMenuPhoto(stored.key)
    return reply('not_found')
  }
  await discardMenuPhoto(result.removedImageKey)
  await cleanupMenuPhotos(pool)
  revalidatePath('/admin')
  return reply(null)
}
