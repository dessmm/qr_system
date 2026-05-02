import { useCart, CartItem as CartItemType } from '@/app/cashier/context/CartContext'

interface CartItemProps {
  item: CartItemType
}

export function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCart()

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-surface-container-low">
      {/* Image / placeholder */}
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-surface-container-low flex-shrink-0">
        {item.image ? (
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          /* Fix #4 carried into cart: initials placeholder */
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <span className="text-sm font-bold text-gray-400 select-none">
              {item.name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')}
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-on-surface text-sm truncate">{item.name}</h4>
        {/* Fix: Philippine Peso symbol */}
        <p className="text-primary font-semibold text-sm">₱{item.price.toFixed(2)}</p>
      </div>

      {/* Fix #1: Quantity Controls — − qty + with remove-at-zero */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => updateQuantity(item.id, item.quantity - 1)}
          aria-label="Decrease quantity"
          className="w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center transition-colors"
        >
          <span className="material-symbols-outlined text-on-surface">remove</span>
        </button>
        <span className="w-8 text-center font-semibold text-on-surface">{item.quantity}</span>
        <button
          onClick={() => updateQuantity(item.id, item.quantity + 1)}
          aria-label="Increase quantity"
          className="w-8 h-8 rounded-full bg-primary text-white hover:bg-primary-container flex items-center justify-center transition-colors"
        >
          <span className="material-symbols-outlined text-on-primary">add</span>
        </button>
      </div>

      {/* Item Total */}
      <div className="w-16 text-right">
        <span className="font-bold text-on-surface">₱{(item.price * item.quantity).toFixed(2)}</span>
      </div>

      {/* Remove */}
      <button
        onClick={() => removeItem(item.id)}
        aria-label="Remove item"
        className="w-8 h-8 rounded-full hover:bg-error-container flex items-center justify-center transition-colors"
      >
        <span className="material-symbols-outlined text-error">close</span>
      </button>
    </div>
  )
}