import { type SVGProps, useId } from "react";

/**
 * The mark: drill-down, drawn as nested discs.
 *
 * Each disc is internally tangent to the one before it at a single point on the
 * 45° axis, so the set reads three ways at once: a globe with a meridian and a lit
 * limb, the terraces of a contour map, and a funnel closing on the small solid dot
 * that is the village at the bottom of every drill-down. Radii 26, 17, 9.5 and 4 on
 * a 64-unit grid; docs/brand.md has the construction.
 *
 * The colours are theme tokens (the --mark-* roles in globals.css); the fallbacks
 * are the same values, so the mark is right even where that stylesheet is not.
 * src/app/icon.svg is the same drawing with the colours fixed.
 */
const FALLBACK = {
	tile: "#002126",
	outer: "#0c8498",
	mid: "#8ed6e8",
	inner: "#eef9fc",
	dot: "#fab92c",
	meridian: "rgb(142 214 232 / 0.5)",
};

const fill = (role: keyof typeof FALLBACK) => ({
	fill: `var(--mark-${role}, ${FALLBACK[role]})`,
});

export function Logo(props: SVGProps<SVGSVGElement>) {
	const clip = useId();
	return (
		<svg
			viewBox="0 0 64 64"
			width="32"
			height="32"
			aria-hidden="true"
			focusable="false"
			className="logo"
			{...props}
		>
			<defs>
				<clipPath id={clip}>
					<circle cx="32" cy="32" r="26" />
				</clipPath>
			</defs>
			<rect width="64" height="64" rx="14" style={fill("tile")} />
			<circle cx="32" cy="32" r="26" style={fill("outer")} />
			<ellipse
				cx="32"
				cy="32"
				rx="12"
				ry="26"
				clipPath={`url(#${clip})`}
				fill="none"
				strokeWidth="1.2"
				style={{ stroke: `var(--mark-meridian, ${FALLBACK.meridian})` }}
			/>
			<circle cx="38.36" cy="38.36" r="17" style={fill("mid")} />
			<circle cx="43.67" cy="43.67" r="9.5" style={fill("inner")} />
			<circle cx="47.56" cy="47.56" r="5.8" style={fill("tile")} />
			<circle cx="47.56" cy="47.56" r="4" style={fill("dot")} />
		</svg>
	);
}
