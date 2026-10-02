import { withBase } from "./base-path";

/** Used only for sub-path builds: files from /public and /api/v1 live under the base path. */
export default function basePathImageLoader({ src }: { src: string; width: number; quality?: number }) {
  return withBase(src);
}
