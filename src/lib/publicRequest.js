// Public, unauthenticated GETs only. Share overlapping reads (including StrictMode)
// without caching settled responses or changing query parameters/backend contracts.
const pending = new Map();
export function publicGet(url) {
  if (!pending.has(url)) {
    const request = fetch(url)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok)
          throw new Error(
            json?.details ||
              json?.error ||
              "Could not load results. Please try again.",
          );
        return json;
      })
      .finally(() => pending.delete(url));
    pending.set(url, request);
  }
  return pending.get(url);
}
