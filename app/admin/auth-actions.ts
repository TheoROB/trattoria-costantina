'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getPool } from '@/lib/db'
import { authenticate } from '@/lib/auth/login'
import { dbErrorCode, endSession, getCurrentAdmin, startSession, trustedClientIp } from '@/lib/auth/dal'
import { writeAudit } from '@/lib/menu/admin'
import { formDataToObject } from '@/lib/menu/admin-input'

export type LoginState = { error: string | null }

// Identical for unknown email, wrong password, locked account and malformed input.
const LOGIN_FAILED = 'Connexion impossible. Vérifiez vos identifiants ou réessayez dans quelques minutes.'

const loginSchema = z.strictObject({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(256),
})

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const object = formDataToObject(formData)
  const parsed = object ? loginSchema.safeParse(object) : null
  if (!parsed?.success) return { error: LOGIN_FAILED }
  try {
    const result = await authenticate(getPool(), { ...parsed.data, ip: await trustedClientIp() })
    if (!result.ok) return { error: LOGIN_FAILED }
    await startSession(result.adminUserId)
    await writeAudit(getPool(), { adminUserId: result.adminUserId, action: 'auth.login' })
  } catch (error) {
    console.error(`[auth] login failed: ${dbErrorCode(error)}`)
    return { error: LOGIN_FAILED }
  }
  redirect('/admin')
}

export async function logout() {
  const admin = await getCurrentAdmin()
  try {
    await endSession()
    if (admin) await writeAudit(getPool(), { adminUserId: admin.adminUserId, action: 'auth.logout' })
  } catch (error) {
    console.error(`[auth] logout failed: ${dbErrorCode(error)}`)
  }
  redirect('/admin/login')
}
