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
