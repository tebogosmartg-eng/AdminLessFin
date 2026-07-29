import { useEffect } from "react";
import { getPageTitle } from "@/config/brand";

export function useDocumentTitle(page?: string) {
  useEffect(() => {
    document.title = getPageTitle(page);
  }, [page]);
}
