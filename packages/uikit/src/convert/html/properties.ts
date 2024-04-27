import { ReadonlySignal, Signal } from '@preact/signals-core'
import { ColorRepresentation } from '../../utils.js'
import { CSSProperties } from 'react'

export type ConversionPropertyType = Array<string | Array<string>> //<- enum

export type ConversionPropertyTypes =
  | Array<Record<string, ConversionPropertyType>>
  | Record<string, ConversionPropertyType>

export type ConversionColorMap = Record<string, ColorRepresentation | (() => ColorRepresentation)>

const yogaPropertyRenamings = {
  rowGap: 'gapRow',
  columnGap: 'gapColumn',
  position: 'positionType',
  top: 'positionTop',
  left: 'positionLeft',
  right: 'positionRight',
  bottom: 'positionBottom',
}

const cssShorthandPropertyTranslation: Record<
  string,
  (set: (key: string, value: string) => void, property: unknown) => void
> = {
  flex: (set, property) => {
    //TODO: simplify
    if (typeof property != 'string') {
      return
    }
    if (property === 'auto') {
      set('flexGrow', '1')
      set('flexShrink', '1')
      set('flexBasis', 'auto')
      return
    }
    if (property === 'none') {
      set('flexGrow', '0')
      set('flexShrink', '0')
      set('flexBasis', 'auto')
    }
    if (property === 'initial') {
      set('flexGrow', '0')
      set('flexShrink', '1')
      set('flexBasis', 'auto')
    }
    let flexGrowShink: Array<string> = []
    let flexBasis: string | undefined
    const parts = property.split(/\s+/)
    for (const part of parts) {
      if (part === 'auto') {
        flexBasis = part
        continue
      }
      const result = digitsWithUnitRegex.exec(part)
      if (result == null) {
        return
      }
      const [, float, unit] = result
      if (unit === '') {
        flexGrowShink.push(float)
        continue
      }
      flexBasis = `${float}${unit}`
    }
    const [flexGrow, flexShrink] = flexGrowShink
    if (flexGrow != null) {
      set('flexGrow', flexGrow)
    }
    if (flexShrink != null) {
      set('flexShrink', flexShrink)
    }
    if (flexBasis != null) {
      set('flexBasis', flexBasis)
    }
  },
}

export function isInheritingProperty(key: string): boolean {
  switch (key) {
    case 'opacity':
    case 'color':
    case 'textAlign':
    case 'verticalAlign':
    case 'fontSize':
    case 'letterSpacing':
    case 'lineHeight':
    case 'wordBreak':
    case 'fontFamily':
    case 'fontWeight':
    case 'visibility':
      return true
    default:
      return key.startsWith('caret') || key.startsWith('scrollbar') || key.startsWith('selection')
  }
}

const percentageRegex = /^(-?\d+|\d*\.\d+)\%$/

export function convertProperties(
  propertyTypes: ConversionPropertyTypes,
  properties: Record<string, string>,
  colorMap: ConversionColorMap | undefined,
  convertKey?: (key: string) => string,
) {
  let result: Record<string, unknown> | undefined
  const set = (key: string, value: string) => {
    const converted: unknown = convertProperty(propertyTypes, key, value, colorMap)
    if (converted == null) {
      return
    }
    if (result == null) {
      result = {}
    }
    result[key] = converted
  }
  for (let key in properties) {
    let property = properties[key as keyof CSSProperties]
    if (key in yogaPropertyRenamings) {
      key = yogaPropertyRenamings[key as keyof typeof yogaPropertyRenamings]
    }
    if (convertKey != null) {
      key = convertKey(key)
    }
    if (key in cssShorthandPropertyTranslation) {
      cssShorthandPropertyTranslation[key](set, property)
      continue
    }
    if (key === 'display' && property === 'block') {
      property = 'flex'
    }
    set(key, property)
  }
  return result
}

const nonDigitRegex = /[^\d\.-]/

export function convertProperty(
  propertyTypes: ConversionPropertyTypes,
  key: string,
  value: string,
  colorMap: ConversionColorMap | undefined,
): boolean | string | number | ColorRepresentation | undefined {
  if (key === 'panelMaterialClass') {
    return value
  }

  if (Array.isArray(propertyTypes)) {
    return firstNotNull(propertyTypes, (type) => convertProperty(type, key, value, colorMap))
  }
  const types = propertyTypes[key]
  if (types == null) {
    return undefined
  }

  return firstNotNull(types, (type) => {
    if (Array.isArray(type)) {
      return typeof value === 'string' && type.includes(value) ? value : undefined
    }
    if (type === 'boolean') {
      return value != 'false'
    }
    if (type === 'string') {
      return typeof value === 'string' ? applyCustomColor(value, colorMap) ?? value : undefined
    }
    if (type === 'percentage') {
      return typeof value === 'string' && percentageRegex.test(value) ? value : undefined
    }
    //type === "number"
    let result = toNumber(value)
    if (result != null && key === 'lineHeight' && !nonDigitRegex.test(value)) {
      return `${result * 100}%`
    }
    return result
  })
}

function firstNotNull<T, K>(array: Array<T>, fn: (val: T) => K | undefined): K | undefined {
  const length = array.length
  for (let i = 0; i < length; i++) {
    const result = fn(array[i])
    if (result != null) {
      return result
    }
  }
  return undefined
}

const divisionExpression = /(\d+)\s*\/\s*(\d+)/
const digitsWithUnitRegex = /^(-?\d+|\d*\.\d+)([^\s\d]*)$/

const unitMultiplierMap: Record<string, number> = {
  rem: 16,
  em: 16,
  px: 1,
  '': 1,
}

export function toNumber(value: string): number | undefined {
  let result: RegExpExecArray | null

  result = digitsWithUnitRegex.exec(value)
  if (result != null) {
    const [, float, unit] = result
    const multiplier = unitMultiplierMap[unit]
    if (multiplier != null) {
      return Number.parseFloat(float) * multiplier
    }
  }
  result = divisionExpression.exec(value)
  if (result != null) {
    const [, a, b] = result
    return Number.parseFloat(a) / Number.parseFloat(b)
  }
}

const variableRegex = /^\$(.+)$/

function applyCustomColor(
  value: string,
  customColors: ConversionColorMap | undefined,
): ColorRepresentation | undefined {
  if (customColors == null) {
    return undefined
  }
  const result = variableRegex.exec(value)
  if (result == null) {
    return value
  }
  const entry = customColors[result[1]]
  if (entry == null) {
    throw new Error(`unknown custom color "${result[1]}"`)
  }
  if (typeof entry === 'function') {
    return entry()
  }
  return entry
}
