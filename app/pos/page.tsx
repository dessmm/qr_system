import { redirect } from 'next/navigation'

/**
 * /pos is an alias for /cashier — the Cashier POS page.
 * The middleware ensures only cashier and admin roles can access this route.
 */
export default function PosRedirect() {
  redirect('/cashier')
}
