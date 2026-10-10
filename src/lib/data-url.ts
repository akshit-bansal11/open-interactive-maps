/**
 * Where `npm run data` output is served from. No trailing slash.
 *
 * Its own module because both the server loader and the browser's search need
 * it, and the loader pulls in server-only React APIs.
 */
export const DATA_URL =
	process.env.NEXT_PUBLIC_DATA_URL ??
	"https://akshit-bansal11.github.io/open-interactive-maps";
