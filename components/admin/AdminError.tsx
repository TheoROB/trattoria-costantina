'use client'

// Shown when an admin request fails (typically a dropped mobile connection during an action).
// Replaces Next.js' default error screen, which uses inline styles blocked by our CSP.
export function AdminError({ retry }: { retry: () => void }) {
  return (
    <div className="admin-card admin-error">
      <h1>Une erreur est survenue</h1>
      <p>La connexion a peut-être été interrompue. Votre dernière modification n’a peut-être pas été enregistrée : vérifiez-la après avoir réessayé.</p>
      <button type="button" className="admin-button admin-button-primary" onClick={() => retry()}>Réessayer</button>
    </div>
  )
}
