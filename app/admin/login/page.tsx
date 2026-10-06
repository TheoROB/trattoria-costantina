import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/admin/LoginForm'
import { getCurrentAdmin } from '@/lib/auth/dal'

export default async function LoginPage() {
  if (await getCurrentAdmin()) redirect('/admin')
  return (
    <main className="admin-login">
      <div className="admin-card">
        <p className="admin-kicker">Trattoria Costantina</p>
        <h1>Administration</h1>
        <LoginForm />
      </div>
    </main>
  )
}
