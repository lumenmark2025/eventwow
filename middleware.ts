import { isSocialCrawler, resolveOgTarget } from "./src/server/seo/og.js";

export const config = {
  matcher: ["/", "/venues/:path*", "/suppliers/:path*"],
};

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const target = resolveOgTarget(url.pathname);
  const userAgent = request.headers.get("user-agent") || "";

  if (!target || !isSocialCrawler(userAgent)) {
    return fetch(request);
  }

  const ogUrl = new URL("/api/og", url.origin);
  ogUrl.searchParams.set("type", target.type);
  if (target.slug) ogUrl.searchParams.set("slug", target.slug);

  return fetch(
    new Request(ogUrl.toString(), {
      method: "GET",
      headers: request.headers,
    })
  );
}
