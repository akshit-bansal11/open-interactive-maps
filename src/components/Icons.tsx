import type { ReactNode, SVGProps } from "react";

/**
 * The few glyphs the interface uses, drawn as 24-unit stroke icons so they take
 * their colour from the text and stay crisp at any size. Decorative: every
 * button that holds one carries its own accessible name.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
	return (
		<svg
			viewBox="0 0 24 24"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			{...props}
		>
			{children}
		</svg>
	);
}

type P = SVGProps<SVGSVGElement>;

export const PlusIcon = (p: P) => (
	<Icon {...p}>
		<path d="M12 5v14M5 12h14" />
	</Icon>
);

export const MinusIcon = (p: P) => (
	<Icon {...p}>
		<path d="M5 12h14" />
	</Icon>
);

/** Fit the whole map back into view. */
export const FitIcon = (p: P) => (
	<Icon {...p}>
		<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
		<circle cx="12" cy="12" r="2.2" />
	</Icon>
);

export const ArrowIcon = (p: P) => (
	<Icon {...p}>
		<path d="m9 6 6 6-6 6" />
	</Icon>
);

export const ChevronIcon = (p: P) => (
	<Icon {...p}>
		<path d="m6 9 6 6 6-6" />
	</Icon>
);

export const SearchIcon = (p: P) => (
	<Icon {...p}>
		<circle cx="11" cy="11" r="6.5" />
		<path d="m20 20-4-4" />
	</Icon>
);

export const CloseIcon = (p: P) => (
	<Icon {...p}>
		<path d="m6 6 12 12M18 6 6 18" />
	</Icon>
);

export const SunIcon = (p: P) => (
	<Icon {...p}>
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
	</Icon>
);

export const MoonIcon = (p: P) => (
	<Icon {...p}>
		<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
	</Icon>
);

export const GithubIcon = (p: P) => (
	<Icon {...p} fill="currentColor" stroke="none">
		<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
	</Icon>
);

export const DownloadIcon = (p: P) => (
	<Icon {...p}>
		<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
	</Icon>
);

export const PanelIcon = (p: P) => (
	<Icon {...p}>
		<rect x="3.5" y="4.5" width="17" height="15" rx="3" />
		<path d="M9.5 4.5v15" />
	</Icon>
);

export const PinIcon = (p: P) => (
	<Icon {...p}>
		<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" />
		<circle cx="12" cy="10.5" r="2.2" />
	</Icon>
);

export const ExternalIcon = (p: P) => (
	<Icon {...p}>
		<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
	</Icon>
);

export const InfoIcon = (p: P) => (
	<Icon {...p}>
		<circle cx="12" cy="12" r="9" />
		<path d="M12 11v5M12 7.8v.1" />
	</Icon>
);

export const WarningIcon = (p: P) => (
	<Icon {...p}>
		<path d="M12 4 2.8 19.5h18.4L12 4ZM12 10v4.5M12 17.3v.1" />
	</Icon>
);

/** The brand mark: a folded map with a pin on it. */
export const LogoMark = (p: P) => (
	<Icon {...p}>
		<path d="M3.5 6.8 9 4.5l6 2.3 5.5-2.3v12.7L15 19.5l-6-2.3-5.5 2.3V6.8Z" />
		<path d="M9 4.5v12.7M15 6.8v12.7" />
	</Icon>
);
