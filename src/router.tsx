import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Cache aggressively — admin reference data (designations, service
        // types, allowances, etc.) barely changes between navigations.
        staleTime: 5 * 60 * 1000, // 5 min: served instantly from cache
        gcTime: 30 * 60 * 1000, // 30 min in memory
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // Refetch when a component re-mounts if the query is stale.
        // After a mutation calls invalidateQueries, this guarantees the
        // very next visit to that page shows fresh data instead of a
        // cached copy — the "count updates but the row is missing until
        // I refresh" symptom users see across admin lists.
        refetchOnMount: true,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
