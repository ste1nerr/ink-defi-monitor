import { useEffect } from "react";

const APP_NAME = "Ink DeFi Monitor";

export function usePageTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} · ${APP_NAME}` : APP_NAME;
  }, [page]);
}
