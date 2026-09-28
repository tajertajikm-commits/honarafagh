/** Static demo image loader: files from /public live under the demo's base path. */
export default function demoImageLoader({ src }: { src: string; width: number; quality?: number }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return src.startsWith("/") && !src.startsWith("//") && !src.startsWith(`${base}/`) ? `${base}${src}` : src;
}
