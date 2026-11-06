const publicAppOrigin =
  import.meta.env.VITE_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
  "https://fundr-client.smutua7504.workers.dev";

export function publicAppUrl(path: string) {
  return `${publicAppOrigin}/${path.replace(/^\/+/, "")}`;
}
