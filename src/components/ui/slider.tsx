"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps {
  className?: string
  value?: number[]
  defaultValue?: number[]
  min?: number
  max?: number
  step?: number
  onValueChange?: (value: number | readonly number[]) => void
}

function Slider({
  className,
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
}: SliderProps) {
  const currentValue = value?.[0] ?? defaultValue?.[0] ?? min

  return (
    <input
      type="range"
      className={cn(
        "h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary",
        className
      )}
      data-slot="slider"
      min={min}
      max={max}
      step={step}
      value={currentValue}
      onChange={(e) => {
        const v = Number(e.target.value)
        onValueChange?.([v])
      }}
    />
  )
}

export { Slider }
