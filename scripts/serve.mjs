/**
 * Serves a static directory over http — `data/` after `npm run data`, so the
 * app can be pointed at local maps with NEXT_PUBLIC_DATA_URL.
 * No dependencies: `node scripts/serve.mjs [dir] [port]`, either order.
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const args = process.argv.slice(2);
const PORT = Number(args.find((a) => /^\d+$/.test(a)) ?? 8080);
const ROOT = args.find((a) => !/^\d+$/.test(a)) ?? "data";

const TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".ico": "image/x-icon",
};

/** Mirrors a static host: /in/punjab/ serves in/punjab/index.html. */
function resolve(path) {
	// normalize() collapses any ../ before it can climb out of ROOT.
	const file = join(ROOT, normalize(path).replace(/^[/\\]+/, ""));
	try {
		if (statSync(file).isDirectory()) return join(file, "index.html");
		return file;
	} catch {
		return `${file.replace(/[/\\]$/, "")}.html`;
	}
}

createServer((request, response) => {
	const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
	const target = resolve(path);

	const missing = () => {
		response.writeHead(404, { "content-type": "text/plain" });
		response.end(`Not found: ${path}`);
	};

	try {
		if (!statSync(target).isFile()) return missing();
	} catch {
		return missing();
	}

	response.writeHead(200, {
		"content-type": TYPES[extname(target)] ?? "application/octet-stream",
		// The browser fetches the search index from a different origin than the app.
		"access-control-allow-origin": "*",
	});
	// createReadStream fails asynchronously, so it needs its own handler — an
	// unhandled 'error' here takes the whole server down.
	createReadStream(target)
		.on("error", () => response.end())
		.pipe(response);
}).listen(PORT, () => console.log(`${ROOT} -> http://localhost:${PORT}`));
