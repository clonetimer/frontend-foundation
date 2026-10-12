/** Designer is a separate workspace app. Prefer an explicit deployment URL; dev defaults to port 5174. */
export function designerUrl(origin?: string): string {
  const override = import.meta.env.VITE_DESIGNER_URL?.trim();
  if (override && /^https?:\/\//.test(override)) return override;
  if (origin) {
    const base = new URL(origin);
    return `${base.protocol}//${base.hostname}:5174/`;
  }
  return 'http://localhost:5174/';
}
