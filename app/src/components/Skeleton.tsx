/**
 * Skeleton loading placeholder components.
 * Use animate-pulse to indicate loading state without jarring blank screens.
 */

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-muted animate-pulse ${className}`} />
}

export function SkeletonDashboard() {
  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-6 w-48" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-8 w-24" />
          <SkeletonBlock className="h-8 w-24" />
        </div>
      </div>
      {/* Site overview */}
      <SkeletonBlock className="h-20 w-full" />
      {/* Progress bar */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-4 w-8" />
        </div>
        <SkeletonBlock className="h-1.5 w-full" />
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-20" />
      </div>
      {/* Pipeline */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

export function SkeletonRows({ rows = 5, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
