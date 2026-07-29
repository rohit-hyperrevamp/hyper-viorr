import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";

type Search = { request?: string };

export const Route = createFileRoute("/admin/candidates/rehire")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    request: typeof search.request === "string" ? search.request : undefined,
  }),
  component: RehireRedirect,
});

function RehireRedirect() {
  const search = useSearch({ from: "/admin/candidates/rehire" });
  const navigate = useNavigate();

  useEffect(() => {
    navigate({
      to: "/admin/employees",
      search: { tab: "candidate", ...(search.request ? { rehire: search.request } : {}) },
      replace: true,
    });
  }, [navigate, search.request]);

  return <div className="p-6 text-sm text-muted-foreground">Opening Candidates…</div>;
}