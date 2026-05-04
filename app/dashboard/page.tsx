import { redirect } from 'next/navigation'

/**
 * /dashboard is an alias for /admin — the admin dashboard.
 * This redirect ensures the middleware role check still applies
 * (both /dashboard and /admin require the 'admin' role).
 */
export default function DashboardRedirect() {
  redirect('/admin')
}
