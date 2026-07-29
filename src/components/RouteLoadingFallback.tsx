import { Skeleton } from './ui/skeleton';

// Phase P1.1 — shown inside Layout's <Outlet/> while a lazy-loaded route
// chunk is being fetched. Deliberately scoped to the content area only
// (not full-screen) so the sidebar/header shell stays visible and
// interactive during route transitions.
const RouteLoadingFallback = () => (
  <div className="space-y-4">
    <Skeleton className="h-9 w-64" />
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
    </div>
    <Skeleton className="h-64 w-full" />
  </div>
);

export default RouteLoadingFallback;
