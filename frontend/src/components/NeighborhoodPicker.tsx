import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { NeighborhoodFeatureCollection } from '../lib/contracts'
import { SearchIcon } from './Icons'
import styles from './NeighborhoodPicker.module.css'

type Option = { id: string; name: string }

export function NeighborhoodPicker({
  neighborhoods,
  selectedIds,
  onSelect,
}: {
  neighborhoods?: NeighborhoodFeatureCollection
  selectedIds: string[]
  onSelect: (id: string | null) => void
}) {
  const listId = useId()
  const options = useMemo<Option[]>(() => (neighborhoods?.features ?? [])
    .map(({ properties }) => ({ id: properties.id, name: properties.name }))
    .sort((a, b) => a.name.localeCompare(b.name)), [neighborhoods])
  const selected = options.filter((option) => selectedIds.includes(option.id))
  const [query, setQuery] = useState('')
  const [popup, setPopup] = useState<'closed' | 'pointer' | 'keyboard'>('closed')
  const rootRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLLIElement>(null)
  const open = popup !== 'closed'
  const [activeIndex, setActiveIndex] = useState(0)

  const matches = options.filter((option) => option.name.toLowerCase().includes(query.toLowerCase()))

  const activeMatch = matches[activeIndex]

  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeMatch?.id])

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setPopup('closed')
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])

  function choose(option: Option) {
    setQuery('')
    setActiveIndex(0)
    onSelect(option.id)
  }

  return (
    <div className={styles.root} ref={rootRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setPopup('closed')
    }}>
      <label htmlFor={`${listId}-input`}>Neighborhood</label>
      <div className={styles.search}>
        <div className={styles.inputWrap}>
          <SearchIcon/>
          <input
            id={`${listId}-input`}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && activeMatch ? `${listId}-${activeMatch.id}` : undefined}
            autoComplete="off"
            placeholder={`Search ${options.length} neighborhoods`}
            aria-describedby={open ? `${listId}-count` : undefined}
            onPointerDown={() => {
              if (open) return
              setPopup('pointer')
              setActiveIndex(0)
            }}
            value={query}
            onFocus={() => { setPopup((current) => current === 'pointer' ? 'pointer' : 'keyboard'); setActiveIndex(0) }}
            onChange={(event) => { setQuery(event.target.value); setPopup('keyboard'); setActiveIndex(0) }}
            onKeyDown={(event) => {
              if (open) setPopup('keyboard')
              if (event.key === 'ArrowDown') { event.preventDefault(); setPopup('keyboard'); setActiveIndex((value) => Math.max(0, Math.min(open ? value + 1 : 0, matches.length - 1))) }
              if (event.key === 'ArrowUp') { event.preventDefault(); setPopup('keyboard'); setActiveIndex((value) => Math.max(value - 1, 0)) }
              if (event.key === 'Enter' && open && activeMatch) { event.preventDefault(); choose(activeMatch) }
              if (event.key === 'Escape') { setPopup('closed') }
            }}
          />
          {selectedIds.length > 0 && <button type="button" className={styles.clear} onClick={() => { setQuery(''); setPopup('closed'); setActiveIndex(0); onSelect(null) }} aria-label="Clear neighborhood selection">Clear all</button>}
        </div>
        {open && (
          <div className={`${styles.popup} ${popup === 'pointer' ? styles.pointerEntrance : ''}`}>
            <p id={`${listId}-count`} className={styles.resultCount} role="status">{matches.length} {matches.length === 1 ? 'neighborhood' : 'neighborhoods'}. Type to narrow results.</p>
            <ul id={listId} className={styles.list} role="listbox" aria-multiselectable="true">
              {matches.length ? matches.map((option, index) => (
                <li
                  id={`${listId}-${option.id}`}
                  key={option.id}
                  role="option"
                  tabIndex={-1}
                  ref={index === activeIndex ? activeRef : undefined}
                  aria-selected={selectedIds.includes(option.id)}
                  className={index === activeIndex ? styles.active : ''}
                  onMouseDown={(event) => { event.preventDefault() }}
                  onClick={() => choose(option)}
                >{option.name}</li>
              )) : <li className={styles.noResults}>No matching neighborhood</li>}
            </ul>
          </div>
        )}
      </div>
      {selected.length > 0 && <ul className={styles.selections} aria-label="Selected neighborhoods">
        {selected.map((option) => <li key={option.id}><button type="button" onClick={() => onSelect(option.id)} aria-label={`Remove ${option.name}`}>{option.name}<span aria-hidden="true"> ×</span></button></li>)}
      </ul>}
    </div>
  )
}
