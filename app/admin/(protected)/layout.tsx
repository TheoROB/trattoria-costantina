import Link from 'next/link'
import { logout } from '@/app/admin/auth-actions'
import { requireAdmin } from '@/lib/auth/dal'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  return (
    <>
      <header className="admin-header">
        <Link href="/admin" className="admin-brand">
          Trattoria Costantina <span>Administration</span>
        </Link>
        <nav className="admin-header-nav" aria-label="Administration">
          <Link href="/admin">La carte</Link>
          <Link href="/admin/demandes-de-reservation">Demandes de réservation</Link>
        </nav>
        <div className="admin-header-actions">
          <span className="admin-user">{admin.email}</span>
          <form action={logout}>
            <button type="submit" className="admin-button admin-button-ghost">Se déconnecter</button>
          </form>
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </>
  )
}
