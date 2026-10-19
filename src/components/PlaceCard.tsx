"use client";

import { CloseIcon, ExternalIcon } from "@/components/Icons";
import { formatPopulation, KIND_NAMES, placeLatLon } from "@/lib/places.mjs";
import type { MapFile, Place } from "@/types/map";

const KIND_BLURB = ["City", "Town", "Village"];

const degrees = (value: number, positive: string, negative: string) =>
	`${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;

/** What is known about the place that was clicked, and where to read more. */
export function PlaceCard({
	map,
	place,
	onClose,
}: {
	map: MapFile;
	place: Place;
	onClose: () => void;
}) {
	const [name, kind, x, y, population, osm] = place;
	// Approximate: the canvas is simplified, and the inverse is of its projection.
	const at = placeLatLon(map, x, y);

	return (
		<aside className="card place-card" aria-label={`${name}, ${KIND_NAMES[kind]}`}>
			<header>
				<span className="kind-dot" data-kind={kind} />
				<div>
					<p className="eyebrow">{KIND_BLURB[kind]}</p>
					<h2>{name}</h2>
				</div>
				<button
					type="button"
					className="icon-button small"
					aria-label="Close"
					onClick={onClose}
				>
					<CloseIcon width={16} height={16} />
				</button>
			</header>
			<dl>
				{population > 0 && (
					<>
						<dt>Population</dt>
						<dd className="num">{formatPopulation(population)}</dd>
					</>
				)}
				{at && (
					<>
						<dt>Location</dt>
						<dd className="num nowrap">
							<span className="visually-hidden">approximately </span>
							<span aria-hidden="true">≈ </span>
							{degrees(at.lat, "N", "S")}, {degrees(at.lng, "E", "W")}
						</dd>
					</>
				)}
				<dt>In</dt>
				<dd>{map.name}</dd>
			</dl>
			<a
				className="link-button"
				href={`https://www.openstreetmap.org/node/${osm}`}
				target="_blank"
				rel="noopener noreferrer"
			>
				View on OpenStreetMap
				<ExternalIcon width={15} height={15} />
			</a>
		</aside>
	);
}
