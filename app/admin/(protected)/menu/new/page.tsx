import { ItemForm } from '@/components/admin/ItemForm'
import { AdminMenuScreen, categoryHref, loadAdminMenu, pickCategory } from '@/components/admin/AdminMenuScreen'
import { createItem } from '@/app/admin/menu-actions'
import { requireAdmin } from '@/lib/auth/dal'
import { isMenuCategoryKey } from '@/lib/menu/categories'

type PageProps = { searchParams: Promise<{ categorie?: string }> }

// New item, in the side panel over the list of the category it is added to.
export default async function NewMenuItemPage({ searchParams }: PageProps) {
  await requireAdmin()
  const { categorie } = await searchParams
  const categories = await loadAdminMenu()
  const active = categories ? pickCategory(categories, categorie) : undefined
  const preselected = categorie && isMenuCategoryKey(categorie) ? categorie : undefined
  return (
    <AdminMenuScreen
      categories={categories}
      active={active}
      panel={{
        title: 'Nouvel élément',
        content: <ItemForm action={createItem} defaultCategory={preselected} cancelHref={active ? categoryHref(active.key) : '/admin'} />,
      }}
    />
  )
}
