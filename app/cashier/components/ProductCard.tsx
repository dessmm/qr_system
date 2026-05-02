'use client'

import { useState, useRef, useCallback } from 'react'
import { MenuItem, saveMenuItem } from '@/lib/data'
import { useCart } from '@/app/cashier/context/CartContext'

interface ProductCardProps {
  product: MenuItem
  onCartPulse?: () => void
}

export function ProductCard({ product, onCartPulse }: ProductCardProps) {
  const { addItem } = useCart()
  const [imgError, setImgError] = useState(false)
  const [added, setAdded] = useState(false)
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0)
  const lastAddedAt = useRef(0)

  const variants = product.variants ?? []
  const selectedVariant = variants[selectedVariantIndex]
  const displayPrice = selectedVariant?.price ?? product.price

  const isUnavailable = !product.available || displayPrice === 0

  const handleAdd = useCallback(() => {
    if (isUnavailable) return
    const now = Date.now()
    if (now - lastAddedAt.current < 500) return
    lastAddedAt.current = now

    addItem({
      id: selectedVariant?.name ? `${product.id}::${selectedVariant.name}` : product.id,
      baseId: product.id,
      name: product.name,
      price: displayPrice,
      image: product.image,
      category: product.category,
      variantName: selectedVariant?.name,
    })

    setAdded(true)
    setTimeout(() => setAdded(false), 800)
    onCartPulse?.()
  }, [isUnavailable, addItem, product, displayPrice, selectedVariant, onCartPulse])

  const initials = product.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')

  // ── 86 badge logic ────────────────────────────────────────────────────────
  // Show badge only when stock is tracked OR item is sold out.
  // If stock is undefined (unlimited) and item is available → no badge at all.
  const showBadge = product.stock !== undefined || !product.available
  const badgeLabel = !product.available ? 'Sold Out' : String(product.stock)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={isUnavailable ? undefined : handleAdd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (!isUnavailable) handleAdd()
        }
      }}
      className={`group bg-white rounded-2xl p-4 shadow-sm border border-surface-container-high hover:shadow-md hover:border-primary/30 transition-all duration-200 text-left w-full relative ${
        isUnavailable ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
      }`}
    >
      {/* Image / Placeholder */}
      <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-surface-container-low">
        {imgError || !product.image ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <span className="text-2xl font-bold text-gray-400 select-none">{initials}</span>
          </div>
        ) : (
          <img
            src={product.image}
            alt={product.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}

        {/* Unavailable overlay */}
        {isUnavailable && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white font-semibold text-sm">Unavailable</span>
          </div>
        )}

        {/* "Added" feedback badge */}
        {added && (
          <div className="absolute inset-0 bg-green-500/90 flex items-center justify-center rounded-xl animate-fade-in">
            <span className="text-white font-bold flex items-center gap-1 text-sm">
              <span className="material-symbols-outlined text-base">check_circle</span>
              Added
            </span>
          </div>
        )}

        {/* ── Stock count / Sold Out badge ─────────────────────────────────
             Only renders when:
             - stock is a tracked number (e.g. 86, 12, 3)  → shows the count
             - item is marked unavailable                   → shows "Sold Out"
             Hidden entirely when stock is undefined (unlimited) + available
        ─────────────────────────────────────────────────────────────────── */}
        {showBadge && (
          <button
            onClick={async (e) => {
              e.stopPropagation()
              try {
                await saveMenuItem({ id: product.id, available: !product.available })
              } catch (err) {
                console.error('Failed to update availability', err)
              }
            }}
            title={product.available ? 'Click to mark as sold out' : 'Click to mark as available'}
            className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold shadow-sm transition-colors ${
              product.available
                ? 'bg-white text-on-surface-variant hover:bg-red-100 hover:text-red-700'
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
          >
            {badgeLabel}
          </button>
        )}
      </div>

      {/* Info */}
      <div className="space-y-1">
        <h3 className="font-semibold text-on-surface text-sm truncate">{product.name}</h3>
        <p className="text-xs text-on-surface-variant line-clamp-2 h-8">{product.description}</p>
        {variants.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {variants.map((variant, idx) => (
              <div
                key={variant.name}
                onClick={(event) => {
                  event.stopPropagation()
                  setSelectedVariantIndex(idx)
                }}
                className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                  selectedVariantIndex === idx
                    ? 'bg-primary text-white'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {variant.name}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-primary font-bold text-lg">
            ₱{displayPrice.toFixed(2)}
          </span>
          <span className="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            add_shopping_cart
          </span>
        </div>
      </div>
    </div>
  )
}