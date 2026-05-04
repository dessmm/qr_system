'use client'

import { useSession, signOut as nextAuthSignOut } from 'next-auth/react'
import { signOut as firebaseSignOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useRouter } from 'next/navigation'
import { ROLE_LANDING, UserRole } from '@/lib/auth'

export default function UnauthorizedPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const role = session?.user?.role as UserRole | undefined
  const landing = role ? ROLE_LANDING[role] : '/login'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-orange-50 px-4">
      <div className="max-w-md w-full text-center animate-fade-in">
        {/* Icon */}
        <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-red-500 text-5xl">block</span>
        </div>

        {/* Heading */}
        <h1 className="text-4xl font-black text-zinc-900 mb-2">403</h1>
        <h2 className="text-xl font-bold text-zinc-700 mb-4">Access Denied</h2>

        <p className="text-zinc-500 text-sm leading-relaxed mb-8">
          You don&apos;t have permission to access this page.
          {role && (
            <>
              {' '}Your role is <span className="font-bold text-primary capitalize">{role}</span>.
            </>
          )}
        </p>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => router.push(landing)}
            className="w-full py-3.5 bg-primary hover:bg-primary-container text-white rounded-xl font-bold text-sm
                       transition-all shadow-lg shadow-primary/20 active:scale-[0.98]
                       flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">home</span>
            {role ? `Go to ${ROLE_LANDING[role]}` : 'Go to Login'}
          </button>

          {session && (
            <button
              onClick={async () => {
                try { await firebaseSignOut(auth) } catch(e){}
                await nextAuthSignOut({ callbackUrl: '/login' })
              }}
              className="w-full py-3 border border-zinc-200 text-zinc-600 hover:bg-zinc-50 rounded-xl font-medium text-sm
                         transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              Sign out and switch account
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
