import { useEffect, useId, useMemo, useState } from 'react'
import type { NeighborhoodFeatureCollection } from '../lib/contracts'
import { SearchIcon } from './Icons'
import styles from './NeighborhoodPicker.module.css'

type Option = { id: string; name: string }

export function NeighborhoodPicker({
  neighborhoods,
  selectedId,
  onSelect,
}: {
  neighborhoods?: NeighborhoodFeatureCollection
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const listId = useId()
  const options = useMemo<Option[]>(() => (neighborhoods?.features ?? [])
    .map(({ properties }) => ({ id: properties.id, name: properties.name }))
    .sort((a, b) => a.name.localeCompare(b.name)), [neighborhoods])
  const selected = options.find((option) => option.id === selectedId)
  const [query, setQuery] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => { setQuery(selected?.name ?? '') }, [selected?.name])
  const matches = options.filter((option) => option.name.toLowerCase().includes(query.toLowerCase())).slice(0, 12)

  function choose(option: Option) {
    setQuery(option.name)
    setOpen(false)
    onSelect(option.id)
  }

  return (
    <div className={styles.root}>
      <label htmlFor={`${listId}-input`}>NEIGHBORHOOD</label>
      <div className={styles.inputWrap}>
        <SearchIcon/>
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[activeIndex] ? `${listId}-${matches[activeIndex].id}` : undefined}
          autoComplete="off"
          placeholder="Search 94 neighborhoods"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0) }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((value) => Math.min(value + 1, matches.length - 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)) }
            if (event.key === 'Enter' && matches[activeIndex]) { event.preventDefault(); choose(matches[activeIndex]) }
            if (event.key === 'Escape') { setOpen(false) }
          }}
        />
        {selectedId && <button type="button" className={styles.clear} onClick={() => { setQuery(''); onSelect(null) }} aria-label="Clear neighborhood selection">Clear</button>}
      </div>
      {open && (
        <ul id={listId} className={styles.list} role="listbox">
          {matches.length ? matches.map((option, index) => (
            <li
              id={`${listId}-${option.id}`}
              key={option.id}
              role="option"
              aria-selected={option.id === selectedId}
              className={index === activeIndex ? styles.active : ''}
              onMouseDown={(event) => { event.preventDefault(); choose(option) }}
            >{option.name}</li>
          )) : <li className={styles.noResults}>No matching neighborhood</li>}
        </ul>
      )}
    </div>
  )
}
