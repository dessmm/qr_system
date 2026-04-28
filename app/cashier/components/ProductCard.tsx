'use client'

import { useState, useRef, useCallback } from 'react'
import { MenuItem } from '@/lib/data'
import { useCart } from '@/app/cashier/context/CartContext'

interface ProductCardProps {
  product: MenuItem
  onCartPulse?: () => void // callback to animate cart icon in nav
}

export function ProductCard({ product, onCartPulse }: ProductCardProps) {
  const { addItem } = useCart()
  const [imgError, setImgError] = useState(false)
  const [added, setAdded] = useState(false)
  // Debounce guard — tracks the last add timestamp per card instance
  const lastAddedAt = useRef(0)

  // Fix #8: treat zero-price items as unavailable
  const isUnavailable = !product.available || product.price === 0

  // Fix #5: debounced add with 500ms guard, 800ms feedback badge
  const handleAdd = useCallback(() => {
    if (isUnavailable) return
    const now = Date.now()
    if (now - lastAddedAt.current < 500) return // debounce 500ms
    lastAddedAt.current = now

    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
    })

    // Show "Added" badge for 800ms
    setAdded(true)
    setTimeout(() => setAdded(false), 800)

    // Pulse the nav cart icon if parent passed the callback
    onCartPulse?.()
  }, [isUnavailable, addItem, product, onCartPulse])

  // Fix #4: derive initials from product name for placeholder
  const initials = product.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <button
      onClick={handleAdd}
      disabled={isUnavailable}
      className={`group bg-white rounded-2xl p-4 shadow-sm border border-surface-container-high hover:shadow-md hover:border-primary/30 transition-all duration-200 text-left w-full relative ${
        isUnavailable ? 'cursor-not-allowed opacity-70' : ''
      }`}
    >
      {/* Image / Placeholder */}
      <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-surface-container-low">
        {/* Fix #4: show placeholder div on error instead of broken image */}
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

        {/* Fix #8: Unavailable overlay for zero-price or unavailable items */}
        {isUnavailable && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {product.price === 0 ? 'Unavailable' : 'Unavailable'}
            </span>
          </div>
        )}

        {/* Fix #5: "Added" feedback badge */}
        {added && (
          <div className="absolute inset-0 bg-green-500/90 flex items-center justify-center rounded-xl animate-fade-in">
            <span className="text-white font-bold flex items-center gap-1 text-sm">
              <span className="material-symbols-outlined text-base">check_circle</span>
              Added
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-1">
        <h3 className="font-semibold text-on-surface text-sm truncate">{product.name}</h3>
        <p className="text-xs text-on-surface-variant line-clamp-2 h-8">{product.description}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-primary font-bold text-lg">
            {/* Currency changed to Philippine Peso */}
            ₱{product.price.toFixed(2)}
          </span>
          <span className="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            add_shopping_cart
          </span>
        </div>
      </div>
    </button>
  )
}