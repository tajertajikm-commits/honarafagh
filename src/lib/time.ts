/** Request-time helpers for server components (each render is one request). */
export const daysAgo = (days: number, from: Date = new Date()) => new Date(from.getTime() - days * 86_400_000);
export const daysAhead = (days: number, from: Date = new Date()) => new Date(from.getTime() + days * 86_400_000);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
