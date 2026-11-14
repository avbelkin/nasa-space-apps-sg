import type { ReactNode } from 'react'

interface IconProps {
  className?: string
}

// Decorative 24-unit stroke icons; the control that hosts one carries the accessible name.
function SvgIcon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 5v14M5 12h14" />
    </SvgIcon>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 12h14" />
    </SvgIcon>
  )
}

export function LocateIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </SvgIcon>
  )
}

export function ResetViewIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 3.5v5h5" />
    </SvgIcon>
  )
}

export function OrbitIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)" />
      <circle cx="20.2" cy="7.6" r="1.6" fill="currentColor" stroke="none" />
    </SvgIcon>
  )
}

export function CloudIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M7 18.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6-1.3A4.7 4.7 0 0 0 7 18.5Z" />
    </SvgIcon>
  )
}

export function NightLightsIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      <path d="M19 3v4M17 5h4" />
    </SvgIcon>
  )
}

export function FlameIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 21.5c-3.6 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.9-7.9.4 1.9 1.3 3 2.4 3.6-.1-3.4 1.4-6 3.6-7.5-.3 2.6.7 4.4 2.1 6.1 1.2 1.5 1.9 3 1.9 4.9 0 3.9-3 7-7.4 7Z" />
      <path d="M12 21.5c-1.7 0-3-1.3-3-3 0-1.9 1.6-2.9 2.3-4.4.6 1 1.4 1.4 2.2 1.6.9.9 1.5 1.7 1.5 2.9 0 1.6-1.3 2.9-3 2.9Z" />
    </SvgIcon>
  )
}

export function PauseIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M9 5v14M15 5v14" />
    </SvgIcon>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </SvgIcon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </SvgIcon>
  )
}

export function RainCloudIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M7 15.5h9.5a3.5 3.5 0 0 0 .4-7 5.2 5.2 0 0 0-10.1-1.1A4.1 4.1 0 0 0 7 15.5Z" />
      <path d="M8.5 18.5l-1 2.5M12.5 18.5l-1 2.5M16.5 18.5l-1 2.5" />
    </SvgIcon>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m15 18-6-6 6-6" />
    </SvgIcon>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m9 18 6-6-6-6" />
    </SvgIcon>
  )
}

export function SunriseIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 18h18" />
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M12 10V4m-3 3 3-3 3 3" />
    </SvgIcon>
  )
}

export function SunsetIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 18h18" />
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M12 4v6m-3-3 3 3 3-3" />
    </SvgIcon>
  )
}
