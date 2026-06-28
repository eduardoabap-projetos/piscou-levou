'use client';

import ProductCard from './ProductCard';
import SkeletonCard from './SkeletonCard';

/**
 * Responsive product grid with loading states and empty state.
 * @param {Object} props
 * @param {Array}  props.products  - Array of product objects
 * @param {boolean} props.loading  - Show skeletons
 * @param {number} props.skeletonCount - How many skeletons to show (default: 10)
 * @param {string} [props.emptyMessage] - Message when no products
 */
export default function ProductGrid({
  products = [],
  loading = false,
  skeletonCount = 10,
  emptyMessage = 'Nenhum produto encontrado nesta categoria.',
}) {
  if (loading) {
    return (
      <div className="products-grid" aria-label="Carregando produtos...">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h3 className="font-heading font-bold text-xl text-text-primary mb-2">
          Nada por aqui ainda
        </h3>
        <p className="text-text-muted max-w-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="products-grid" aria-label="Grade de produtos">
      {products.map((product, idx) => (
        <div
          key={product.id}
          className="animate-fade-in"
          style={{ animationDelay: `${Math.min(idx * 0.04, 0.4)}s`, animationFillMode: 'backwards' }}
        >
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
