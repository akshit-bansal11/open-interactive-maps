import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import Link from "next/link";
import { CountryStrip } from "@/components/CountryStrip";
import { readIndex } from "@/lib/maps";
import "./globals.css";

export const metadata: Metadata = {
	title: {
		default: "Open Interactive Maps",
		template: "%s — Open Interactive Maps",
	},
	description:
		"Browse the administrative map of every country, from the world down to its smallest published division, and copy or download any of them as SVG, PNG or JSON.",
};

const REPO = "https://github.com/akshit-bansal11/open-interactive-maps";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	const { countries } = await readIndex();

	return (
		<html lang="en">
			<body>
				<header className="topbar">
					<Link className="brand" href="/">
						<svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">
							<path
								d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z M9 4v13.5 M15 6.5V20"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.6"
								strokeLinejoin="round"
							/>
						</svg>
						<span>Open Interactive Maps</span>
					</Link>

					<a className="ghost" href={REPO} target="_blank" rel="noopener noreferrer">
						GitHub
					</a>
				</header>

				<CountryStrip countries={countries} />
				{children}
				<Analytics />
			</body>
		</html>
	);
}
