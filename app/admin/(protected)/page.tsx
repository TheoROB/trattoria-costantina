import { AdminMenuScreen, loadAdminMenu, pickCategory } from '@/components/admin/AdminMenuScreen'
import { ReservationRequestsSummary } from '@/components/admin/ReservationRequestsSummary'
import { requireAdmin } from '@/lib/auth/dal'

type PageProps = { searchParams: Promise<{ categorie?: string; erreur?: string }> }

export default async function AdminMenuPage({ searchParams }: PageProps) {
  await requireAdmin()
  const { categorie, erreur } = await searchParams
  const categories = await loadAdminMenu()
  return (
    <>
      <ReservationRequestsSummary />
      <AdminMenuScreen categories={categories} active={categories ? pickCategory(categories, categorie) : undefined} error={erreur} />
    </>
  )
}
