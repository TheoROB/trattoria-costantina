import { mediaRoot, readVariant } from '@/lib/media/storage'

// Serves the photo variants stored in MEDIA_ROOT (outside the build, so not servable from public/).
// Keys are random and never reused: a replaced photo gets a new URL, so responses are immutable.
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  let data: Buffer | null = null
  try {
    data = await readVariant(mediaRoot(), file)
  } catch (error) {
    console.error(`[media] read failed: ${(error as { code?: string }).code ?? (error as Error).message}`)
  }
  if (!data) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(data.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
