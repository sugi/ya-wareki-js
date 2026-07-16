import { describe, expect, it } from 'vitest'
import { toKan } from 'ya-kansuji'
import { VERSION } from '../src/index.js'

describe('package', () => {
  it('has a version number', () => {
    expect(VERSION).toBe('0.2.0')
  })

  it('resolves the local ya-kansuji dependency', () => {
    expect(toKan(1234)).toBe('千二百三十四')
  })
})
