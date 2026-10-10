import type { NextConfig } from "next";

const config: NextConfig = {
	typedRoutes: false,
	/**
	 * Every map address serves the one static page. There are most of a hundred
	 * thousand maps; a page each would mean a server render the first time any of
	 * them is opened, and this way the first paint is a file off the CDN.
	 */
	async rewrites() {
		return [{ source: "/world/:path*", destination: "/" }];
	},
};

export default config;
