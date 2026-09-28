/** Tiny browser shims for the static demo build. */

type Cb<T> = (err: Error | null, value?: T) => void;

/** node:util promisify (callback-last functions). */
export function promisify<T>(fn: (...args: never[]) => void) {
  return (...args: unknown[]) =>
    new Promise<T>((resolve, reject) => {
      (fn as unknown as (...a: unknown[]) => void)(...args, ((err, value) => (err ? reject(err) : resolve(value as T))) as Cb<T>);
    });
}

const util = { promisify };
export default util;
