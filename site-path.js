// The document base is / locally and the configured Pages/custom-domain path in dist.
export function siteBase(base = document.baseURI) {
  const url = new URL(base);
  url.search = ''; url.hash = '';
  return new URL('./', url);
}
export function siteRoute(location, base) {
  if (location.hash.startsWith('#/')) return location.hash.slice(2);
  const prefix = siteBase(base).pathname;
  const path = location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : '';
  return !path || path === 'index.html' || path === '404.html' ? 'home' : path + location.search;
}
