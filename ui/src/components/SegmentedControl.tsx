import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  // Accessible name when the visible label is terse; must contain the visible text.
  ariaLabel?: string
}

interface SegmentedControlProps<T extends string> {
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (next: T) => void
  className?: string
}

// Joined control for one-of-many choices (WAI-ARIA radio group pattern): a single tab stop on
// the checked segment, arrow keys move and select, Home/End jump to the ends.
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement | null>(null)
  const checkedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  const selectIndex = (index: number) => {
    const next = options[index]
    if (!next) {
      return
    }
    onChange(next.value)
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const isRtl = groupRef.current ? getComputedStyle(groupRef.current).direction === 'rtl' : false
    const forward = isRtl ? 'ArrowLeft' : 'ArrowRight'
    const backward = isRtl ? 'ArrowRight' : 'ArrowLeft'
    const last = options.length - 1
    let target: number | null = null

    if (event.key === forward || event.key === 'ArrowDown') {
      target = index === last ? 0 : index + 1
    } else if (event.key === backward || event.key === 'ArrowUp') {
      target = index === 0 ? last : index - 1
    } else if (event.key === 'Home') {
      target = 0
    } else if (event.key === 'End') {
      target = last
    }

    if (target !== null) {
      event.preventDefault()
      selectIndex(target)
    }
  }

  return (
    <div
      ref={groupRef}
      className={className ? `segmented ${className}` : 'segmented'}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option, index) => {
        const checked = index === checkedIndex
        return (
          <button
            key={option.value}
            type="button"
            className="segmented-option"
            role="radio"
            aria-checked={checked}
            aria-label={option.ariaLabel}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
