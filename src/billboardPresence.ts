import { useEffect, useState } from "react";
export type Billboard = {
  id: string;
  title: string;
  description: string;
  destination: string;
};
export function useBillboards(
  courseId?: string,
  version?: number,
  levelId?: string,
) {
  const [ads, setAds] = useState<Billboard[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setAds([]);
    const load = () => {
      if (document.hidden || (courseId && (!version || !levelId))) return;
      void fetch(
        "/api/billboards" +
          (courseId
            ? `?courseId=${encodeURIComponent(courseId)}&version=${version}&levelId=${encodeURIComponent(levelId || "")}`
            : ""),
        { signal: controller.signal, cache: "no-store" },
      )
        .then((r) => (r.ok ? r.json() : []))
        .then(setAds)
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [courseId, version, levelId]);
  return ads;
}
