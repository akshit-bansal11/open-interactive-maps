"use client";

import { useState } from "react";
import { buildSvg, STYLE } from "@/lib/svg.mjs";
import type { MapFile } from "@/types/map";

/** The longest side of a map is always 1000 units, so a scale reads as pixels. */
const SCALES = [1, 2, 4];

function save(map: MapFile, blob: Blob, extension: string) {
	const url = URL.createObjectURL(blob);
	const link = Object.assign(document.createElement("a"), {
		href: url,
		download: `${map.id.replace(/\//g, "-")}.${extension}`,
	});
	link.click();
	URL.revokeObjectURL(url);
}

const svgBlob = (map: MapFile) => new Blob([buildSvg(map)], { type: "image/svg+xml" });

/** Rasterises the exported SVG, so the PNG is exactly what the SVG is. */
function savePng(map: MapFile, scale: number, transparent: boolean, onFail: () => void) {
	const url = URL.createObjectURL(svgBlob(map));
	const image = new Image();
	image.onload = () => {
		const surface = document.createElement("canvas");
		surface.width = map.width * scale;
		surface.height = map.height * scale;
		const context = surface.getContext("2d");
		URL.revokeObjectURL(url);
		if (!context) return onFail();
		if (!transparent) {
			context.fillStyle = STYLE.background;
			context.fillRect(0, 0, surface.width, surface.height);
		}
		context.drawImage(image, 0, 0, surface.width, surface.height);
		surface.toBlob((blob) => (blob ? save(map, blob, "png") : onFail()));
	};
	image.onerror = () => {
		URL.revokeObjectURL(url);
		onFail();
	};
	image.src = url;
}

/** Native disclosure: keyboard and screen-reader behaviour come with it. */
export function ExportMenu({ map }: { map: MapFile }) {
	const [scale, setScale] = useState(2);
	const [transparent, setTransparent] = useState(false);
	const [said, setSaid] = useState("");

	const say = (text: string) => {
		setSaid(text);
		setTimeout(() => setSaid(""), 1600);
	};

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(buildSvg(map));
			say("SVG copied");
		} catch {
			// The clipboard needs a secure context and permission; a file always works.
			save(map, svgBlob(map), "svg");
			say("Clipboard unavailable — saved the file instead");
		}
	};

	return (
		<details className="export">
			<summary>Export</summary>
			<div className="menu">
				<button type="button" onClick={copy}>
					Copy SVG
				</button>
				<button type="button" onClick={() => save(map, svgBlob(map), "svg")}>
					Download SVG
				</button>
				<button
					type="button"
					onClick={() =>
						save(
							map,
							new Blob([JSON.stringify(map, null, "\t")], { type: "application/json" }),
							"json",
						)
					}
				>
					Download JSON
				</button>
				<hr />
				<button
					type="button"
					onClick={() =>
						savePng(map, scale, transparent, () => say("The PNG could not be made"))
					}
				>
					Download PNG
				</button>
				<label>
					Size
					<select
						value={scale}
						onChange={(event) => setScale(Number(event.target.value))}
					>
						{SCALES.map((value) => (
							<option key={value} value={value}>
								{value * 1000} px
							</option>
						))}
					</select>
				</label>
				<label>
					<input
						type="checkbox"
						checked={transparent}
						onChange={(event) => setTransparent(event.target.checked)}
					/>
					Transparent background
				</label>
				<p className="said" role="status" aria-live="polite">
					{said}
				</p>
			</div>
		</details>
	);
}
