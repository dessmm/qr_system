'use client'

import { signOut as nextAuthSignOut } from 'next-auth/react'
import { signOut as firebaseSignOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface LogoutButtonProps {
  className?: string
  variant?: 'icon' | 'full' | 'text'
}

/**
 * Reusable logout button — drop into any protected layout.
 *
 * Variants:
 *   - `full`  → icon + label (default)
 *   - `icon`  → icon-only
 *   - `text`  → text-only, styled as a link
 */
export default function LogoutButton({ className, variant = 'full' }: LogoutButtonProps) {
  const handleLogout = async () => {
    try {
      await firebaseSignOut(auth)
    } catch (e) {
      console.error('Firebase signout error', e)
    }
    await nextAuthSignOut({ callbackUrl: '/login' })
  }

  if (variant === 'text') {
    return (
      <button
        onClick={handleLogout}
        className={`text-sm text-red-500 hover:text-red-700 font-medium transition-colors ${className ?? ''}`}
      >
        Sign Out
      </button>
    )
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleLogout}
        title="Sign Out"
        className={`p-2 hover:bg-red-50 rounded-xl transition-colors group ${className ?? ''}`}
      >
        <span className="material-symbols-outlined text-zinc-400 group-hover:text-red-500 transition-colors">
          logout
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={handleLogout}
      className={`flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl
                 font-medium text-sm transition-all active:scale-95 ${className ?? ''}`}
    >
      <span className="material-symbols-outlined text-lg">logout</span>
      Sign Out
    </button>
  )
}
