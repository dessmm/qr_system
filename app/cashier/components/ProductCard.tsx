import { Product } from '../data/products'
import { useCart } from '@/app/cashier/context/CartContext'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart()

  const handleAdd = () => {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category
    })
  }

  return (
    <button
      onClick={handleAdd}
      className="group bg-white rounded-2xl p-4 shadow-sm border border-surface-container-high hover:shadow-md hover:border-primary/30 transition-all duration-200 text-left w-full"
    >
      {/* Image */}
      <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-surface-container-low">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {!product.available && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white font-semibold">Unavailable</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-1">
        <h3 className="font-semibold text-on-surface text-sm truncate">
          {product.name}
        </h3>
        <p className="text-xs text-on-surface-variant line-clamp-2 h-8">
          {product.description}
        </p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-primary font-bold text-lg">
            ${product.price.toFixed(2)}
          </span>
          <span className="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            add_shopping_cart
          </span>
        </div>
      </div>
    </button>
  )
}