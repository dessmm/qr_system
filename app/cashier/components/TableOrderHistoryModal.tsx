'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '@/lib/firebase'
import {
  collection, query, where, orderBy, limit,
  getDocs, startAfter, QueryDocumentSnapshot
} from 'firebase/firestore'
import { Order, Table } from '@/lib/data'

const PAGE_SIZE = 20

interface TableOrderHistoryModalProps {
  table: Table
  isOpen: boolean
  onClose: () => void
}

export function TableOrderHistoryModal({ table, isOpen, onClose }: TableOrderHistoryModalProps) {
  const [orders, setOrders]   = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // --- Refs ---
  // lastDocRef: Firestore cursor for pagination
  const lastDocRef  = useRef<QueryDocumentSnapshot | null>(null)
  // Observer and sentinel for IntersectionObserver
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  // Mirror loading/hasMore as refs so the stable fetchOrders callback
  // can read the latest values without being recreated on every state change.
  // (Prevents the IntersectionObserver from reconnecting on every fetch cycle.)
  const loadingRef  = useRef(false)
  const hasMoreRef  = useRef(true)

  // -------------------------------------------------------------------
  // fetchOrders — stable identity (deps: only table.tableNumber)
  // Reads loading/hasMore from refs to avoid stale closures.
  // -------------------------------------------------------------------
  const fetchOrders = useCallback(async (isNextPage: boolean) => {
    if (loadingRef.current || (!hasMoreRef.current && isNextPage)) return

    loadingRef.current = true
    setLoading(true)

    try {
      const constraints = [
        where('tableNumber', '==', table.tableNumber),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE),
        ...(isNextPage && lastDocRef.current ? [startAfter(lastDocRef.current)] : []),
      ]

      const snap = await getDocs(query(collection(db, 'orders'), ...constraints))
      const newOrders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))

      const more = snap.docs.length === PAGE_SIZE
      hasMoreRef.current = more
      setHasMore(more)

      if (snap.docs.length > 0) {
        lastDocRef.current = snap.docs[snap.docs.length - 1]
      }

      setOrders(prev => isNextPage ? [...prev, ...newOrders] : newOrders)
    } catch (err) {
      console.error('[TableOrderHistoryModal] fetch error:', err)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [table.tableNumber]) // ← stable — no loading/hasMore deps

  // -------------------------------------------------------------------
  // Initial load: reset state and fetch page 1 whenever modal opens
  // or the table changes.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return
    setOrders([])
    setHasMore(true)
    hasMoreRef.current = true
    lastDocRef.current = null
    fetchOrders(false)
  }, [isOpen, table.tableNumber]) // eslint-disable-line react-hooks/exhaustive-deps
  // fetchOrders intentionally omitted — stable ref, no effect on correctness

  // -------------------------------------------------------------------
  // IntersectionObserver: set up ONCE on open, tear down on close.
  // The observer callback reads refs so it never goes stale.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          fetchOrders(true)
        }
      },
      {
        // root: the scrollable modal body — set via data attribute below
        root: null,
        rootMargin: '40px',
        threshold: 0,   // ← trigger as soon as any pixel is visible
      }
    )

    // sentinelRef.current may not be in DOM yet if orders haven't loaded;
    // we attach lazily in the ref callback on the sentinel div.
    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current)
    }

    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [isOpen, fetchOrders]) // fetchOrders is stable — this runs once per open

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/*
        Modal wrapper:
          - flex flex-col + max-h-[85vh] bound the overall height
          - overflow-hidden clips the rounded corners cleanly
          - The SCROLL lives on the inner body div, not here
      */}
      <div
        className="bg-surface rounded-3xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden shadow-2xl border border-outline-variant"
        onClick={e => e.stopPropagation()}
      >
        {/* --- Sticky header --- */}
        <div className="shrink-0 p-4 border-b border-surface-container-low flex items-center justify-between bg-white">
          <div>
            <h3 className="font-bold text-on-surface">Table {table.tableNumber} History</h3>
            <p className="text-sm text-on-surface-variant">Order History</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/*
          Scrollable body:
            - flex-1 + min-h-0  ← CRITICAL: without min-h-0 the flex child
              won't shrink below its content height, breaking overflow-y-scroll
            - overflow-y-scroll  ← always shows scrollbar (avoids layout jump)
            - overscroll-behavior-contain  ← stops scroll from bubbling to page
        */}
        <div className="flex-1 min-h-0 overflow-y-scroll overscroll-contain p-4 space-y-4 bg-surface-container-lowest">

          {/* Empty state */}
          {orders.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl mb-3">history</span>
              <p className="font-medium">No order history found</p>
              <p className="text-sm mt-1">Orders for this table will appear here</p>
            </div>
          )}

          {/* Order cards — exact same UI as the QR orders tab */}
          {orders.map(order => (
            <div key={order.id} className="bg-white rounded-xl p-4 border border-surface-container-low shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold">Order {order.id.slice(0, 8)}</h3>
                  <p className="text-sm text-on-surface-variant">
                    {new Date(order.createdAt).toLocaleString()} &bull; {order.status}
                  </p>
                </div>
                <span className="text-sm font-mono text-primary">₱{order.total.toFixed(2)}</span>
              </div>
              <div className="space-y-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.name}</span>
                    <span>₱{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/*
            Sentinel div — IntersectionObserver watches this element.
            Using a ref callback so the observer is attached the instant
            this element mounts (even after the initial orders render).
          */}
          <div
            ref={el => {
              sentinelRef.current = el
              if (el && observerRef.current) {
                observerRef.current.observe(el)
              }
            }}
            className="flex items-center justify-center h-12"
            aria-hidden="true"
          >
            {loading && (
              <div className="flex items-center gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                <span className="text-sm">Loading orders…</span>
              </div>
            )}
            {!hasMore && orders.length > 0 && (
              <p className="text-xs text-outline">All orders loaded</p>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
