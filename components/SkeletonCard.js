'use client';

/**
 * Skeleton card for loading states — mirrors ProductCard layout.
 */
export default function SkeletonCard() {
  return (
    <div
      className="flex flex-col bg-white border border-[#EAEAEA] rounded-lg overflow-hidden"
      aria-hidden="true"
    >
      {/* Image skeleton */}
      <div className="w-full aspect-square skeleton" />

      {/* Content skeleton */}
      <div className="flex flex-col p-3 gap-3">
        {/* Title */}
        <div className="space-y-2">
          <div className="h-3.5 skeleton rounded-full w-full" />
          <div className="h-3.5 skeleton rounded-full w-4/5" />
        </div>

        {/* Price */}
        <div className="space-y-1.5 mt-1">
          <div className="h-3 skeleton rounded-full w-1/3" />
          <div className="h-6 skeleton rounded-full w-1/2" />
        </div>

        {/* CTA Button */}
        <div className="h-10 skeleton rounded-xl mt-1" />
      </div>
    </div>
  );
}
