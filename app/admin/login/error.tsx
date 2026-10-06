'use client'

import { AdminError } from '@/components/admin/AdminError'

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <AdminError retry={retry} />
}
