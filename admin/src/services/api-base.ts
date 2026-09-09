/**
 * Base URL for the booking worker. In production the worker is routed on the
 * admin host itself (`admin.djkmdlegends.com/api/*`) and in dev Vite proxies
 * `/api` to `wrangler dev`, so the default is same-origin (empty prefix).
 * `VITE_BOOKING_API_URL` remains an optional override for pointing a build at
 * another origin (e.g. a preview worker).
 */
export const apiUrl: string = import.meta.env.VITE_BOOKING_API_URL ?? '';
