/**
 * models.test.ts — spec resolution with owner edits (data/models.ts).
 * Rules: owner overrides lay on top of code defaults FIELD BY FIELD
 * (an edited sqft never blanks the default tonnage); '' / absent override
 * fields fall through; unknown models stay empty. Module-global overrides
 * MUST be reset in afterEach (the applyPortalDates testing gotcha).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { applyModelSpecs, effectiveSpec, modelKey, specFor } from './models'

afterEach(() => applyModelSpecs(undefined))

describe('specFor with owner edits', () => {
  it('uses code defaults when no overrides are applied', () => {
    expect(specFor('Model A')).toEqual({ sqft: 1039, tons: 2 })
  })
  it('lays an edit over the default field by field', () => {
    applyModelSpecs({ A: { sqft: 1050 } })
    expect(specFor('Model A-LH')).toEqual({ sqft: 1050, tons: 2, beds: undefined })
  })
  it("'' in an override falls through to the default (never blanks it)", () => {
    applyModelSpecs({ Independence: { sqft: '', tons: 3.5 } })
    expect(specFor('Independence LHG')).toEqual({ sqft: 1737, tons: 3.5, beds: 3 })
  })
  it('an override on a model with NO code default stands alone', () => {
    applyModelSpecs({ Liberty: { sqft: 1500, tons: 3 } })
    expect(effectiveSpec('Liberty')).toEqual({ sqft: 1500, tons: 3, beds: undefined })
  })
  it('unknown model with no override = empty spec', () => {
    expect(effectiveSpec('Nope')).toEqual({ sqft: '', tons: '' })
  })
  it('modelKey still normalizes roster strings', () => {
    expect(modelKey('Model F-LH')).toBe('F')
    expect(modelKey('Independence LHG')).toBe('Independence')
  })
})
