// Resize only our public listing photographs. Signed/private URLs, external
// hosts, local assets and URLs with existing parameters retain their contracts.
export function publicImageSources(src, supabaseUrl) {
  try {
    const url = new URL(src);
    if (
      url.origin !== new URL(supabaseUrl).origin ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      return { src };
    if (
      !/^\/storage\/v1\/object\/public\/(supplier-gallery|venue-images|venue-hero-images)\/.+\.(jpe?g|png|webp)$/i.test(
        url.pathname,
      )
    )
      return { src };
    const image = new URL(url);
    image.pathname = image.pathname.replace(
      "/object/public/",
      "/render/image/public/",
    );
    const sized = (width) => {
      image.search = new URLSearchParams({
        width: String(width),
        quality: "80",
        resize: "contain",
      }).toString();
      return image.href;
    };
    return {
      src: sized(640),
      srcSet: [320, 640, 960, 1600, 2400]
        .map((width) => `${sized(width)} ${width}w`)
        .join(", "),
      fallbackSrc: src,
    };
  } catch {
    return { src };
  }
}
