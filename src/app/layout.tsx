import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import "./globals.css";

const ui = Geist({ subsets: ["latin"], variable: "--font-ui" });
const display = Instrument_Serif({
	subsets: ["latin"],
	weight: "400",
	variable: "--font-display",
});

export const metadata: Metadata = {
	title: "Open Interactive Maps",
	description:
		"Browse the administrative map of every country, from the world down to villages, and copy or download any of them as SVG, PNG or JSON.",
};

export const viewport: Viewport = {
	colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={`${ui.variable} ${display.variable}`}>
			<body>
				{children}
				<Analytics />
			</body>
		</html>
	);
}
