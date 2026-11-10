import type { PluginContext } from '@eum-agent/plugin'
import { describe, expect, it } from 'vitest'
import plugin from '../src/index.ts'

describe('tool exposure', () => {
  it('offers every tool on demand instead of preloading it', async () => {
    const tools: Array<{ name: string; preload?: boolean }> = []
    const ctx = {
      tools: {
        register: (t: { name: string; preload?: boolean }) => tools.push(t),
        guide: () => {},
      },
      widgets: { register: () => {} },
      client: { registerPackageFiles: () => {} },
    } as unknown as PluginContext
    await plugin.apply(ctx)
    expect(tools.length).toBe(7)
    expect(tools.filter((t) => t.preload !== false).map((t) => t.name)).toEqual([])
  })
})
