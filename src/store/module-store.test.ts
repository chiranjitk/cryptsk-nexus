/**
 * Production unit tests for the Module Zustand store (useModuleStore)
 *
 * Covers: initial state, initialize, enableModule, disableModule, toggleModule,
 * setEnabledModules, setDeploymentType, isModuleEnabled, applyPreset,
 * core module protection, deployment type validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useModuleStore } from '@/store/module-store'
import { MODULES } from '@/lib/modules/registry'

// ─── Tests ────────────────────────────────────────────────────

describe('useModuleStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useModuleStore.setState({
      enabledModules: MODULES.filter((m) => m.defaultEnabled).map((m) => m.id),
      deploymentType: 'isp',
      isLoaded: false,
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Initial State
  // ═══════════════════════════════════════════════════════════════

  describe('initial state', () => {
    it('should have core module enabled by default', () => {
      expect(useModuleStore.getState().isModuleEnabled('core')).toBe(true)
    })

    it('should not be loaded initially', () => {
      expect(useModuleStore.getState().isLoaded).toBe(false)
    })

    it('should have default deployment type "isp"', () => {
      expect(useModuleStore.getState().deploymentType).toBe('isp')
    })

    it('should have all defaultEnabled modules enabled', () => {
      const state = useModuleStore.getState()
      const defaultModules = MODULES.filter((m) => m.defaultEnabled)
      defaultModules.forEach((m) => {
        expect(state.enabledModules).toContain(m.id)
      })
    })

    it('should not have non-default modules enabled', () => {
      const state = useModuleStore.getState()
      const nonDefaultModules = MODULES.filter((m) => !m.defaultEnabled)
      nonDefaultModules.forEach((m) => {
        expect(state.enabledModules).not.toContain(m.id)
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // initialize
  // ═══════════════════════════════════════════════════════════════

  describe('initialize', () => {
    it('should set isLoaded to true', () => {
      useModuleStore.getState().initialize(['core', 'network-infra'], 'isp')

      expect(useModuleStore.getState().isLoaded).toBe(true)
    })

    it('should set enabled modules from input', () => {
      useModuleStore.getState().initialize(['core', 'field-ops'], 'campus')

      expect(useModuleStore.getState().enabledModules).toContain('core')
      expect(useModuleStore.getState().enabledModules).toContain('field-ops')
    })

    it('should set deployment type', () => {
      useModuleStore.getState().initialize(['core'], 'education')

      expect(useModuleStore.getState().deploymentType).toBe('education')
    })

    it('should fallback to "isp" for invalid deployment types', () => {
      useModuleStore.getState().initialize(['core'], 'invalid-type')

      expect(useModuleStore.getState().deploymentType).toBe('isp')
    })

    it('should fallback to default modules when empty array is given', () => {
      const defaultModules = MODULES.filter((m) => m.defaultEnabled).map((m) => m.id)

      useModuleStore.getState().initialize([], 'isp')

      const state = useModuleStore.getState()
      defaultModules.forEach((id) => {
        expect(state.enabledModules).toContain(id)
      })
    })

    it('should accept all valid deployment types', () => {
      const validTypes = ['isp', 'education', 'hospital', 'hotel', 'campus', 'enterprise', 'full']

      validTypes.forEach((type) => {
        useModuleStore.setState({ deploymentType: 'isp' }) // reset
        useModuleStore.getState().initialize(['core'], type)
        expect(useModuleStore.getState().deploymentType).toBe(type)
      })
    })

    it('should replace previous enabled modules entirely', () => {
      useModuleStore.setState({ enabledModules: ['core', 'network-infra', 'gateway'] })
      useModuleStore.getState().initialize(['core'], 'isp')

      expect(useModuleStore.getState().enabledModules).toEqual(['core'])
      expect(useModuleStore.getState().enabledModules).not.toContain('network-infra')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // enableModule
  // ═══════════════════════════════════════════════════════════════

  describe('enableModule', () => {
    it('should add module to enabled list', () => {
      useModuleStore.setState({ enabledModules: ['core'] })
      useModuleStore.getState().enableModule('ipv6')

      expect(useModuleStore.getState().enabledModules).toContain('ipv6')
    })

    it('should not add duplicate module entries', () => {
      useModuleStore.setState({ enabledModules: ['core', 'ipv6'] })
      useModuleStore.getState().enableModule('ipv6')

      const count = useModuleStore.getState().enabledModules.filter((m) => m === 'ipv6').length
      expect(count).toBe(1)
    })

    it('should keep existing modules when enabling new one', () => {
      useModuleStore.setState({ enabledModules: ['core', 'network-infra'] })
      useModuleStore.getState().enableModule('finance')

      expect(useModuleStore.getState().enabledModules).toContain('core')
      expect(useModuleStore.getState().enabledModules).toContain('network-infra')
      expect(useModuleStore.getState().enabledModules).toContain('finance')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // disableModule
  // ═══════════════════════════════════════════════════════════════

  describe('disableModule', () => {
    it('should remove optional module from enabled list', () => {
      useModuleStore.setState({ enabledModules: ['core', 'network-infra', 'ipv6'] })
      useModuleStore.getState().disableModule('ipv6')

      expect(useModuleStore.getState().enabledModules).not.toContain('ipv6')
    })

    it('should NOT disable core modules', () => {
      const stateBefore = [...useModuleStore.getState().enabledModules]
      useModuleStore.getState().disableModule('core')

      // Core should still be present
      expect(useModuleStore.getState().enabledModules).toContain('core')
      // State should be unchanged
      expect(useModuleStore.getState().enabledModules).toEqual(stateBefore)
    })

    it('should handle disabling a module that is not enabled', () => {
      useModuleStore.setState({ enabledModules: ['core'] })
      useModuleStore.getState().disableModule('nonexistent-module')

      expect(useModuleStore.getState().enabledModules).toEqual(['core'])
    })

    it('should keep other modules when disabling one', () => {
      useModuleStore.setState({ enabledModules: ['core', 'network-infra', 'gateway', 'ipv6'] })
      useModuleStore.getState().disableModule('ipv6')

      expect(useModuleStore.getState().enabledModules).toContain('core')
      expect(useModuleStore.getState().enabledModules).toContain('network-infra')
      expect(useModuleStore.getState().enabledModules).toContain('gateway')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // toggleModule
  // ═══════════════════════════════════════════════════════════════

  describe('toggleModule', () => {
    it('should enable module when currently disabled', () => {
      useModuleStore.setState({ enabledModules: ['core'] })
      useModuleStore.getState().toggleModule('ipv6')

      expect(useModuleStore.getState().enabledModules).toContain('ipv6')
    })

    it('should disable module when currently enabled', () => {
      useModuleStore.setState({ enabledModules: ['core', 'ipv6'] })
      useModuleStore.getState().toggleModule('ipv6')

      expect(useModuleStore.getState().enabledModules).not.toContain('ipv6')
    })

    it('should NOT toggle core module off (protection)', () => {
      useModuleStore.setState({ enabledModules: ['core'] })
      useModuleStore.getState().toggleModule('core')

      expect(useModuleStore.getState().enabledModules).toContain('core')
    })

    it('should handle toggling the same module multiple times', () => {
      useModuleStore.setState({ enabledModules: ['core'] })

      useModuleStore.getState().toggleModule('ipv6')
      expect(useModuleStore.getState().enabledModules).toContain('ipv6')

      useModuleStore.getState().toggleModule('ipv6')
      expect(useModuleStore.getState().enabledModules).not.toContain('ipv6')

      useModuleStore.getState().toggleModule('ipv6')
      expect(useModuleStore.getState().enabledModules).toContain('ipv6')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // setEnabledModules
  // ═══════════════════════════════════════════════════════════════

  describe('setEnabledModules', () => {
    it('should replace enabled modules list', () => {
      useModuleStore.getState().setEnabledModules(['core', 'finance'])

      const state = useModuleStore.getState()
      expect(state.enabledModules).toContain('core')
      expect(state.enabledModules).toContain('finance')
      expect(state.enabledModules).not.toContain('network-infra')
    })

    it('should always include core modules even if not in input', () => {
      useModuleStore.getState().setEnabledModules(['finance', 'field-ops'])

      expect(useModuleStore.getState().enabledModules).toContain('core')
    })

    it('should not duplicate core modules if already in input', () => {
      useModuleStore.getState().setEnabledModules(['core', 'finance'])

      const coreCount = useModuleStore.getState().enabledModules.filter((m) => m === 'core').length
      expect(coreCount).toBe(1)
    })

    it('should handle empty input array', () => {
      useModuleStore.getState().setEnabledModules([])

      // Should still have core module
      expect(useModuleStore.getState().enabledModules).toContain('core')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // setDeploymentType
  // ═══════════════════════════════════════════════════════════════

  describe('setDeploymentType', () => {
    it('should update deployment type', () => {
      useModuleStore.getState().setDeploymentType('enterprise')

      expect(useModuleStore.getState().deploymentType).toBe('enterprise')
    })

    it('should accept any string (no validation at setter level)', () => {
      useModuleStore.getState().setDeploymentType('custom-type')

      expect(useModuleStore.getState().deploymentType).toBe('custom-type')
    })

    it('should not affect enabled modules', () => {
      const prev = [...useModuleStore.getState().enabledModules]
      useModuleStore.getState().setDeploymentType('education')

      expect(useModuleStore.getState().enabledModules).toEqual(prev)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // isModuleEnabled
  // ═══════════════════════════════════════════════════════════════

  describe('isModuleEnabled', () => {
    it('should return true for enabled module', () => {
      useModuleStore.setState({ enabledModules: ['core', 'network-infra'] })

      expect(useModuleStore.getState().isModuleEnabled('core')).toBe(true)
      expect(useModuleStore.getState().isModuleEnabled('network-infra')).toBe(true)
    })

    it('should return false for disabled module', () => {
      useModuleStore.setState({ enabledModules: ['core'] })

      expect(useModuleStore.getState().isModuleEnabled('ipv6')).toBe(false)
    })

    it('should return false for unknown module', () => {
      useModuleStore.setState({ enabledModules: ['core'] })

      expect(useModuleStore.getState().isModuleEnabled('does-not-exist')).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // applyPreset
  // ═══════════════════════════════════════════════════════════════

  describe('applyPreset', () => {
    it('should set deployment type from preset', () => {
      useModuleStore.getState().applyPreset(['core', 'field-ops'], 'hospital')

      expect(useModuleStore.getState().deploymentType).toBe('hospital')
    })

    it('should set enabled modules from preset', () => {
      useModuleStore.getState().applyPreset(['core', 'finance', 'field-ops'], 'education')

      expect(useModuleStore.getState().enabledModules).toContain('core')
      expect(useModuleStore.getState().enabledModules).toContain('finance')
      expect(useModuleStore.getState().enabledModules).toContain('field-ops')
    })

    it('should always include core modules in preset', () => {
      useModuleStore.getState().applyPreset(['finance', 'field-ops'], 'hotel')

      expect(useModuleStore.getState().enabledModules).toContain('core')
    })

    it('should not duplicate core module if present in preset modules', () => {
      useModuleStore.getState().applyPreset(['core', 'finance'], 'campus')

      const coreCount = useModuleStore.getState().enabledModules.filter((m) => m === 'core').length
      expect(coreCount).toBe(1)
    })

    it('should remove modules not in the preset', () => {
      useModuleStore.setState({ enabledModules: ['core', 'network-infra', 'gateway', 'ips'] })
      useModuleStore.getState().applyPreset(['core', 'field-ops'], 'enterprise')

      expect(useModuleStore.getState().enabledModules).not.toContain('network-infra')
      expect(useModuleStore.getState().enabledModules).not.toContain('gateway')
      expect(useModuleStore.getState().enabledModules).not.toContain('ips')
    })

    it('should handle applying ISP preset (default)', () => {
      const ispModules = [
        'core', 'network-infra', 'services', 'gateway', 'ips', 'app-awareness',
        'traffic-analytics', 'qos-monitor', 'latency-monitor', 'field-ops',
        'finance', 'ai-intelligence', 'voice-assistant',
      ]

      useModuleStore.getState().applyPreset(ispModules, 'isp')

      expect(useModuleStore.getState().deploymentType).toBe('isp')
      ispModules.forEach((id) => {
        expect(useModuleStore.getState().enabledModules).toContain(id)
      })
    })

    it('should handle applying full preset (all modules)', () => {
      const allModuleIds = MODULES.map((m) => m.id)

      useModuleStore.getState().applyPreset(allModuleIds, 'full')

      expect(useModuleStore.getState().deploymentType).toBe('full')
      allModuleIds.forEach((id) => {
        expect(useModuleStore.getState().enabledModules).toContain(id)
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // MODULE_CATEGORY_META Export (tested via the module store file)
  // ═══════════════════════════════════════════════════════════════

  describe('MODULE_CATEGORY_META', () => {
    // Import the metadata to ensure it exports correctly
    it('should be importable and have core category', async () => {
      const { MODULE_CATEGORY_META } = await import('@/store/module-store')
      expect(MODULE_CATEGORY_META.core).toBeDefined()
      expect(MODULE_CATEGORY_META.core.label).toBe('Core Platform')
    })

    it('should have all expected categories', async () => {
      const { MODULE_CATEGORY_META } = await import('@/store/module-store')
      const expectedCategories = ['core', 'network', 'gateway', 'operations', 'finance', 'ai', 'communication', 'addon']
      expectedCategories.forEach((cat) => {
        expect(MODULE_CATEGORY_META[cat as keyof typeof MODULE_CATEGORY_META]).toBeDefined()
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should handle rapid enable/disable cycles', () => {
      useModuleStore.setState({ enabledModules: ['core'] })

      for (let i = 0; i < 50; i++) {
        useModuleStore.getState().toggleModule('ipv6')
      }

      // After 50 toggles (even number), ipv6 should be disabled
      expect(useModuleStore.getState().enabledModules).not.toContain('ipv6')
      // Core should still be there
      expect(useModuleStore.getState().enabledModules).toContain('core')
    })

    it('should handle concurrent state modifications', () => {
      useModuleStore.setState({ enabledModules: ['core'] })

      useModuleStore.getState().enableModule('network-infra')
      useModuleStore.getState().enableModule('gateway')
      useModuleStore.getState().setDeploymentType('enterprise')
      useModuleStore.getState().toggleModule('ipv6')

      expect(useModuleStore.getState().enabledModules).toContain('core')
      expect(useModuleStore.getState().enabledModules).toContain('network-infra')
      expect(useModuleStore.getState().enabledModules).toContain('gateway')
      expect(useModuleStore.getState().enabledModules).toContain('ipv6')
      expect(useModuleStore.getState().deploymentType).toBe('enterprise')
    })

    it('should handle enable then disable of same module', () => {
      useModuleStore.setState({ enabledModules: ['core'] })

      useModuleStore.getState().enableModule('ipv6')
      expect(useModuleStore.getState().enabledModules).toContain('ipv6')

      useModuleStore.getState().disableModule('ipv6')
      expect(useModuleStore.getState().enabledModules).not.toContain('ipv6')
    })

    it('should protect core module through setEnabledModules', () => {
      useModuleStore.getState().setEnabledModules([])

      expect(useModuleStore.getState().enabledModules).toContain('core')
    })

    it('should protect core module through applyPreset', () => {
      useModuleStore.getState().applyPreset([], 'isp')

      expect(useModuleStore.getState().enabledModules).toContain('core')
    })

    it('should not crash when checking unknown module', () => {
      expect(() => useModuleStore.getState().isModuleEnabled('totally-fake-module')).not.toThrow()
    })
  })
})
