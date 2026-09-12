import { useEffect, useState } from "react";
import { publicGet } from "./publicRequest";

export function usePublicProfile(kind, slug) {
  const url = `/api/public-${kind}?slug=${encodeURIComponent(String(slug || ""))}`;
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    publicGet(url)
      .then((data) => {
        if (active) setResult({ url, attempt, data });
      })
      .catch((error) => {
        if (active) setResult({ url, attempt, notFound: error.status === 404 });
      });
    return () => {
      active = false;
    };
  }, [url, attempt]);
  // Never expose a previous profile while a new slug/retry is in flight.
  const current =
    result?.url === url && result?.attempt === attempt ? result : null;
  return {
    data: current?.data,
    loading: !current,
    notFound: current?.notFound,
    retry: () => setAttempt((n) => n + 1),
  };
}
