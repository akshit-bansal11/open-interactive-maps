"use client";

import { useRef } from "react";
import { CloseIcon, ExternalIcon } from "@/components/Icons";
import type { MapFile } from "@/types/map";

const GEOBOUNDARIES = "https://www.geoboundaries.org";
const OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright";
const DOI = "https://doi.org/10.1371/journal.pone.0231866";

function Out({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	);
}

/**
 * The credit that is on screen whatever the map: a small chip with the two data
 * sources, and the full credits — citation, licences, what came from where — in a
 * native dialog, which brings focus handling and Escape with it.
 */
export function Attribution({ map }: { map: MapFile | null }) {
	const dialog = useRef<HTMLDialogElement>(null);

	return (
		<>
			<div className="credit-chip">
				<span>
					© <Out href={GEOBOUNDARIES}>geoBoundaries</Out> · ©{" "}
					<Out href={OSM_COPYRIGHT}>OpenStreetMap</Out> contributors
				</span>
				<button type="button" onClick={() => dialog.current?.showModal()}>
					Credits
				</button>
			</div>

			{/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape already closes a dialog; clicking outside it is a mouse-only extra. */}
			<dialog
				ref={dialog}
				className="credits"
				aria-labelledby="credits-title"
				// A click on the backdrop lands on the dialog element itself.
				onClick={(event) =>
					event.target === event.currentTarget && dialog.current?.close()
				}
			>
				<div className="credits-body">
					<header>
						<h2 id="credits-title">Credits &amp; data licences</h2>
						<form method="dialog">
							<button
								type="submit"
								className="icon-button small"
								aria-label="Close credits"
							>
								<CloseIcon width={16} height={16} />
							</button>
						</form>
					</header>

					<section>
						<h3>Boundaries — geoBoundaries</h3>
						<p>
							Administrative boundaries come from the{" "}
							<Out href={GEOBOUNDARIES}>geoBoundaries</Out> gbOpen release and its donors.
						</p>
						<blockquote>
							Runfola, D. et al. (2020) geoBoundaries: A global database of political
							administrative boundaries. <em>PLOS ONE</em> 15(4): e0231866.{" "}
							<Out href={DOI}>{DOI}</Out>
						</blockquote>
						<p>
							Licences vary by country and by level — some are share-alike, so keep the
							credit on anything you redistribute.
						</p>
						{map && (
							<dl className="this-map">
								<dt>This map ({map.name})</dt>
								<dd>
									{map.source} · {map.license}{" "}
									<Out href={map.sourceUrl}>
										source data
										<ExternalIcon width={13} height={13} />
									</Out>
								</dd>
							</dl>
						)}
					</section>

					<section>
						<h3>Settlements &amp; outlines — OpenStreetMap</h3>
						<p>
							© OpenStreetMap contributors, data available under the{" "}
							<Out href={OSM_COPYRIGHT}>Open Database License (ODbL)</Out>.
						</p>
						<p>
							Cities, towns and villages are read from OpenStreetMap through the Overpass
							API, and a few country outlines through Nominatim.
						</p>
						{map?.placesSource && (
							<dl className="this-map">
								<dt>This map’s settlements</dt>
								<dd>
									{map.placesSource}
									{map.placesLicense && ` · ${map.placesLicense}`}
								</dd>
							</dl>
						)}
					</section>

					<section>
						<h3>Code</h3>
						<p>
							The viewer is MIT licensed and has no map library or tile service. That
							licence does not cover the data above.{" "}
							<Out href="https://github.com/akshit-bansal11/open-interactive-maps">
								Source on GitHub
								<ExternalIcon width={13} height={13} />
							</Out>
						</p>
					</section>
				</div>
			</dialog>
		</>
	);
}
