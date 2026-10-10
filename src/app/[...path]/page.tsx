import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapViewer } from "@/components/MapViewer";
import { readMap } from "@/lib/maps";

interface Props {
	params: Promise<{ path: string[] }>;
}

/**
 * Nothing is prerendered: there are a quarter of a million maps, so each page is
 * rendered the first time someone asks for it and cached from then on.
 */
export function generateStaticParams() {
	return [];
}

export const revalidate = 86_400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const map = await readMap((await params).path.join("/"));
	if (!map) return {};
	const where = [map.name, ...map.parents.map((p) => p.name).reverse()].join(", ");

	return {
		title: map.name,
		// Phrased to sidestep pluralising childLabel — "State / Union Territory"
		// has no sensible plural.
		description: `Interactive map of ${where} — ${map.features.length} ${map.childLabel} areas. Download as SVG, PNG or JSON.`,
	};
}

export default async function MapPage({ params }: Props) {
	const map = await readMap((await params).path.join("/"));
	if (!map) notFound();
	return <MapViewer map={map} />;
}
