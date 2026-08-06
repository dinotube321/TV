import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export function AppleLogo({ size = 18, ...props }: IconProps) {
  return (
    <svg width={size} height={(size * 20) / 17} viewBox="0 0 17 20" fill="currentColor" aria-hidden {...props}>
      <path d="M13.93 10.66c-.02-2.14 1.75-3.17 1.83-3.22-1-1.46-2.55-1.66-3.1-1.68-1.32-.13-2.58.78-3.25.78-.67 0-1.71-.76-2.81-.74-1.45.02-2.78.84-3.52 2.14-1.5 2.6-.38 6.46 1.08 8.57.71 1.03 1.56 2.19 2.68 2.15 1.07-.04 1.48-.7 2.77-.7 1.3 0 1.66.7 2.8.68 1.16-.02 1.89-1.05 2.6-2.09.82-1.2 1.15-2.36 1.17-2.42-.03-.01-2.25-.86-2.27-3.42zm-2.13-6.3c.59-.72.99-1.71.88-2.7-.85.03-1.88.57-2.49 1.28-.55.63-1.03 1.64-.9 2.61.95.07 1.92-.48 2.51-1.19z" />
    </svg>
  );
}

export function AppleTvLogo({ size = 24, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      aria-label="Apple TV"
      {...props}
    >
      <path
        fill="currentColor"
        d="M90.308 5.888C85.767 1.347 79.517.37 70.63.37H25.025C16.529.37 10.23 1.395 5.689 5.888 1.196 10.428.22 16.678.22 25.175v45.361c0 8.887.928 15.137 5.42 19.629 4.59 4.492 10.84 5.469 19.678 5.469H70.63c8.887 0 15.186-.977 19.678-5.47 4.54-4.54 5.469-10.741 5.469-19.628V25.468c0-8.838-.928-15.088-5.47-19.58m-.586 18.31v47.656c0 5.762-.88 10.889-3.857 13.868-2.979 3.027-8.155 3.906-13.916 3.906h-47.95c-5.713 0-10.888-.928-13.916-3.906-2.978-2.979-3.808-8.106-3.808-13.868V24.491c0-6.055.83-11.23 3.808-14.209 2.979-3.027 8.252-3.857 14.258-3.857H71.95c5.761 0 10.937.927 13.916 3.906 3.027 2.978 3.857 8.057 3.857 13.867m-63.77 13.184c3.956.44 7.08-3.955 6.788-7.422-3.956.146-6.885 3.71-6.788 7.422m26.954-5.03h-5.079v5.811h-3.515v3.955h3.515v14.258c0 4.932 1.954 6.69 7.032 6.69 1.074 0 2.295-.098 2.685-.196v-4.15c-.195.146-1.123.146-1.611.146-2.002 0-3.027-.83-3.027-3.076V42.118h4.736v-3.955h-4.736zM39.478 54.374c-1.904-.781-3.076-2.05-3.809-3.809-.781-1.953-.537-3.906 0-5.566.342-1.123 1.123-2.49 3.028-3.613-1.417-2.149-3.663-3.223-6.3-3.223-3.027 0-4.784 1.563-6.298 1.563-1.27 0-2.637-1.465-5.078-1.465-2.637 0-4.737 1.074-6.153 2.832-1.66 2.002-2.343 4.59-2.343 7.177 0 4.297 1.953 9.229 4.736 12.403 1.416 1.66 2.588 2.49 3.955 2.49 2.002 0 3.125-1.465 5.518-1.465 1.025 0 1.953.44 2.539.635.976.39 1.66.732 2.832.732 1.22 0 2.197-.44 2.783-1.074 2.197-2.05 3.906-5.078 4.59-7.617M74.39 62.87l8.935-24.707H77.76l-6.055 19.873-6.347-19.873h-5.42l9.13 24.707z"
      />
    </svg>
  );
}

export function MenuIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function PersonIcon({ size = 11, ...props }: IconProps) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 10 11" fill="currentColor" aria-hidden {...props}>
      <path d="M5 5.2a2.3 2.3 0 100-4.6 2.3 2.3 0 000 4.6zm0 1C2.9 6.2.8 7.3.8 9.1v.7h8.4v-.7c0-1.8-2.1-2.9-4.2-2.9z" />
    </svg>
  );
}

export function PlayIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      {/* Elongated play mark; rounded tip at 3 o'clock + soft rear corners */}
      <path d="M7.4 4.7c0-1.15 1.22-1.86 2.18-1.25l11.35 7.05c.9.56.9 1.94 0 2.5L9.58 19.55c-.96.6-2.18-.1-2.18-1.25V4.7z" />
    </svg>
  );
}

export function PlusIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRight({ size = 12, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden {...props}>
      <path d="M4.2 2.2L8 6l-3.8 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Apple TV shelf-grid nav chevron (tall filled blade). Flip with CSS for right. */
export function ShelfNavChevron(props: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 31" aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M5.275 29.46a1.61 1.61 0 0 0 1.456 1.077c1.018 0 1.772-.737 1.772-1.737 0-.526-.277-1.186-.449-1.62l-4.68-11.912L8.05 3.363c.172-.442.45-1.116.45-1.625A1.7 1.7 0 0 0 6.728.002a1.6 1.6 0 0 0-1.456 1.09L.675 12.774c-.301.775-.677 1.744-.677 2.495 0 .754.376 1.705.677 2.498L5.272 29.46Z"
      />
    </svg>
  );
}

export function ChevronLeft({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDown({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden {...props}>
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PauseIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function VolumeIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden {...props}>
      <path d="M4 10v4h3l5 4V6L7 10H4z" fill="currentColor" stroke="none" />
      <path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" />
    </svg>
  );
}

export function VolumeMuteIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden {...props}>
      <path d="M4 10v4h3l5 4V6L7 10H4z" fill="currentColor" stroke="none" />
      <path d="M16 9l5 6M21 9l-5 6" />
    </svg>
  );
}

export function CloseIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
