import { Signal } from '@preact/signals-core'
import { AllOptionalProperties, Properties, WithClasses, traverseProperties } from './default'
import { AllAliases, allAliases } from './alias'

export class MergedProperties {
  private propertyMap = new Map<string, Array<unknown | Signal<unknown>>>()

  add(key: string, value: unknown) {
    if (value === undefined) {
      //only adding non undefined values to the properties
      return
    }
    //applying the aliases
    const aliases = allAliases[key as keyof AllAliases]
    if (aliases == null) {
      this.addToMap(key, value)
      return
    }
    const length = aliases.length
    for (let i = 0; i < length; i++) {
      this.addToMap(aliases[i], value)
    }
  }

  private addToMap(key: string, value: unknown) {
    let entry = this.propertyMap.get(key)
    if (entry == null) {
      this.propertyMap.set(key, (entry = []))
    }
    if (!(value instanceof Signal)) {
      //if its not a signal we can clear the previous values
      entry.length = 0
    }
    entry.push(value)
  }

  /**
   * @returns undefined if the property doesn't exist
   */
  read(key: string): unknown {
    const entry = this.propertyMap.get(key)
    if (entry == null) {
      return undefined
    }
    const length = entry.length
    //searching for the property with the highest precedence (most right) that is not undefined
    for (let i = length - 1; i >= 0; i--) {
      const value = entry[i]
      const result = value instanceof Signal ? value.value : value
      if (result === undefined) {
        continue
      }
      return result
    }
    //no property found that is not undefined
    return undefined
  }

  filterIsEqual(filter: (key: string) => boolean, old: MergedProperties | undefined): boolean {
    if (old == null) {
      return this.propertyMap.size === 0
    }
    if (old.propertyMap.size != this.propertyMap.size) {
      return false
    }
    for (const key of this.propertyMap.keys()) {
      if (!filter(key)) {
        continue
      }
      if (!this.isEqual(old, key)) {
        return false
      }
    }
    for (const key of old.propertyMap.keys()) {
      if (!filter(key)) {
        continue
      }
      if (!old.isEqual(this, key)) {
        return false
      }
    }
    return true
  }

  filterCompare(
    filter: (key: string) => boolean,
    old: MergedProperties | undefined,
    onNew: (key: string) => void,
    onChange: (key: string) => void,
    onDelete: (key: string) => void,
  ): void {
    for (const key of this.propertyMap.keys()) {
      if (!filter(key)) {
        continue
      }
      if (old == null) {
        onNew(key)
        continue
      }
      const oldEntry = old.propertyMap.get(key)
      if (oldEntry == null) {
        //new
        onNew(key)
        continue
      }
      const thisEntry = this.propertyMap.get(key)
      if (shallodwEqual(oldEntry, thisEntry!)) {
        continue
      }
      //changed
      onChange(key)
    }
    if (old == null) {
      return
    }
    for (const key of old.propertyMap.keys()) {
      if (!filter(key)) {
        continue
      }
      if (this.propertyMap.has(key)) {
        continue
      }
      onDelete(key)
    }
  }

  isEqual(otherMap: MergedProperties, key: string): boolean {
    const entry1 = this.propertyMap.get(key)
    const entry2 = otherMap.propertyMap.get(key)
    if (entry1 == null || entry2 == null) {
      return entry1 === entry2
    }
    return shallodwEqual(entry1, entry2)
  }

  addAll(defaultProperties: AllOptionalProperties | undefined, properties: WithClasses<Properties>): void {
    traverseProperties(defaultProperties, properties, (p) => {
      for (const key in p) {
        this.add(key, p[key])
      }
    })
  }
}

function shallodwEqual(a1: Array<any>, a2: Array<any>): boolean {
  const length = a1.length
  if (length != a2.length) {
    return false
  }
  for (let i = 0; i < length; i++) {
    if (a1[i] != a2[i]) {
      return false
    }
  }
  return true
}
