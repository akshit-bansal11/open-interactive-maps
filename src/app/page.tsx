import { MapApp } from "@/components/MapApp";

/**
 * The only page. Every map URL is rewritten to it (see next.config.ts), and the
 * browser draws whichever map the address names, so the server never renders a
 * map and moving between maps never asks it for anything.
 */
export default function Home() {
	return <MapApp />;
}
