export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 animate-pulse">
      <div className="h-3.5 bg-gray-200 rounded w-1/3 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-1/2 mb-2" />
      <div className="h-3 bg-gray-200 rounded w-1/4" />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3 animate-pulse border-l-4 border-gray-200">
      <div className="flex items-center gap-3 flex-1">
        <div className="w-8 h-8 bg-gray-200 rounded-full shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-gray-200 rounded w-2/5" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
        </div>
      </div>
      <div className="h-4 bg-gray-200 rounded w-16 shrink-0" />
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
      <div className="h-52 bg-gray-100 rounded-lg" />
    </div>
  )
}
