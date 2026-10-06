'use client'

import { useActionState } from 'react'
import { login, type LoginState } from '@/app/admin/auth-actions'

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null })
  return (
    <form action={action} className="admin-form">
      {state.error && <p role="alert" className="admin-alert">{state.error}</p>}
      <div className="admin-field">
        <label htmlFor="login-email">Email</label>
        <input id="login-email" type="email" name="email" autoComplete="username" required maxLength={254} />
      </div>
      <div className="admin-field">
        <label htmlFor="login-password">Mot de passe</label>
        <input id="login-password" type="password" name="password" autoComplete="current-password" required maxLength={256} />
      </div>
      <button type="submit" className="admin-button admin-button-primary" disabled={pending}>Se connecter</button>
    </form>
  )
}
