import { useEffect, useState, type KeyboardEvent } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { monthAt, monthIndex, monthLabel, type MonthRange } from '../lib/trendRange'
import slider from './AppShell.module.css'
import styles from './TrendRangeControl.module.css'

type Props = {
  bounds: MonthRange
  range: MonthRange
  onChange: (range: MonthRange) => void
}

export function TrendRangeControl({ bounds, range, onChange }: Props) {
  const minimum = monthIndex(bounds.from)
  const maximum = monthIndex(bounds.through)
  const start = monthIndex(range.from)
  const end = monthIndex(range.through)
  const [draft, setDraft] = useState([start, end])
  useEffect(() => setDraft([start, end]), [start, end, minimum, maximum])
  const [draftStart = start, draftEnd = end] = draft
  const months = Array.from({ length: maximum - minimum + 1 }, (_, offset) => monthAt(minimum + offset))
  const recent = monthAt(Math.max(minimum, maximum - 11))
  const isFull = start === minimum && end === maximum

  function moveThumb(event: KeyboardEvent<HTMLSpanElement>, thumb: 'start' | 'end') {
    const isStart = thumb === 'start'
    const lower = isStart ? minimum : draftStart
    const upper = isStart ? draftEnd : maximum
    const current = isStart ? draftStart : draftEnd
    const step = event.shiftKey ? 10 : 1
    let target: number
    switch (event.key) {
      case 'Home':
        target = lower
        break
      case 'End':
        target = upper
        break
      case 'PageUp':
        target = current + 10
        break
      case 'PageDown':
        target = current - 10
        break
      case 'ArrowUp':
      case 'ArrowRight':
        target = current + step
        break
      case 'ArrowDown':
      case 'ArrowLeft':
        target = current - step
        break
      default:
        return
    }
    event.preventDefault()
    const next = Math.max(lower, Math.min(upper, target))
    onChange({ from: monthAt(isStart ? next : draftStart), through: monthAt(isStart ? draftEnd : next) })
  }

  return (
    <div className={styles.control} role="group" aria-label="Chart date range">
      <div className={styles.header}>
        <div>Chart date range <strong>{monthLabel(monthAt(draftStart))} – {monthLabel(monthAt(draftEnd))}</strong></div>
        <div className={styles.actions}>
          <button type="button" onClick={() => onChange({ from: recent, through: bounds.through })} disabled={range.from === recent && end === maximum}>Last 12 months</button>
          <button type="button" onClick={() => onChange(bounds)} disabled={isFull}>Reset</button>
        </div>
      </div>
      {minimum < maximum && <Slider.Root
        className={slider.slider}
        min={minimum}
        max={maximum}
        step={1}
        minStepsBetweenThumbs={0}
        value={draft}
        onValueChange={setDraft}
        onValueCommit={([from, through]) => {
          if (from !== undefined && through !== undefined) onChange({ from: monthAt(from), through: monthAt(through) })
        }}
      >
        <Slider.Track className={slider.track}><Slider.Range className={slider.range}/></Slider.Track>
        <Slider.Thumb className={slider.thumb} aria-label="Chart start month" aria-valuetext={monthLabel(monthAt(draftStart))}
          aria-valuemax={draftEnd} onKeyDown={(event) => moveThumb(event, 'start')}/>
        <Slider.Thumb className={slider.thumb} aria-label="Chart end month" aria-valuetext={monthLabel(monthAt(draftEnd))}
          aria-valuemin={draftStart} onKeyDown={(event) => moveThumb(event, 'end')}/>
      </Slider.Root>}
      <div className={styles.fields}>
        <label>From month
          <select value={range.from} onChange={(event) => onChange({ from: event.target.value, through: range.through })}>
            {months.filter((month) => month <= range.through).map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
          </select>
        </label>
        <label>Through month
          <select value={range.through} onChange={(event) => onChange({ from: range.from, through: event.target.value })}>
            {months.filter((month) => month >= range.from).map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}
