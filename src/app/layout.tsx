import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const ui = Geist({ subsets: ["latin"], variable: "--font-ui" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
	title: "Open Interactive Maps",
	description:
		"Browse the administrative map of every country, from the world down to villages, and copy or download any of them as SVG, PNG or JSON. Boundaries from geoBoundaries, settlements from OpenStreetMap.",
};

export const viewport: Viewport = {
	colorScheme: "light dark",
};

/**
 * Runs before first paint, so a remembered theme is on <html> before anything is
 * drawn and a dark-mode reader who chose light never sees a dark flash. Storage
 * can throw (private windows, blocked site data); then the system theme stands.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		// The script above sets data-theme before React hydrates, which is the one
		// attribute the server could not have known.
		<html
			lang="en"
			className={`${ui.variable} ${mono.variable}`}
			suppressHydrationWarning
		>
			<head>
				<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
			</head>
			<body>
				{children}
				<Analytics />
			</body>
		</html>
	);
}
