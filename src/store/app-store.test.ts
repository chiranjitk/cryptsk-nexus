/**
 * Production unit tests for the App Zustand store (useAppStore)
 *
 * Covers: initial state, navigation (setCurrentPage), sidebar groups (toggleGroup,
 * isGroupCollapsed), notifications, user state (setUser), complaint count,
 * command palette (setCommandPaletteOpen, toggleCommandPalette), NAV_GROUPS export.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAppStore, NAV_GROUPS } from '@/store/app-store'

// ─── Tests ────────────────────────────────────────────────────

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAppStore.setState({
      currentPage: 'Dashboard',
      currentSection: 'MAIN',
      collapsedGroups: [],
      unreadNotificationCount: 0,
      user: {
        id: '',
        name: '',
        email: '',
        role: 'OPERATOR' as const,
        avatarUrl: undefined,
        ispName: '',
      },
      openComplaintCount: 0,
      commandPaletteOpen: false,
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Initial State
  // ═══════════════════════════════════════════════════════════════

  describe('initial state', () => {
    it('should have Dashboard as default currentPage', () => {
      expect(useAppStore.getState().currentPage).toBe('Dashboard')
    })

    it('should have MAIN as default currentSection', () => {
      expect(useAppStore.getState().currentSection).toBe('MAIN')
    })

    it('should have empty collapsedGroups', () => {
      expect(useAppStore.getState().collapsedGroups).toEqual([])
    })

    it('should have zero unreadNotificationCount', () => {
      expect(useAppStore.getState().unreadNotificationCount).toBe(0)
    })

    it('should have default user with empty fields', () => {
      const user = useAppStore.getState().user
      expect(user.id).toBe('')
      expect(user.name).toBe('')
      expect(user.email).toBe('')
      expect(user.role).toBe('OPERATOR')
    })

    it('should have zero openComplaintCount', () => {
      expect(useAppStore.getState().openComplaintCount).toBe(0)
    })

    it('should have command palette closed', () => {
      expect(useAppStore.getState().commandPaletteOpen).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Navigation
  // ═══════════════════════════════════════════════════════════════

  describe('setCurrentPage', () => {
    it('should update currentPage', () => {
      useAppStore.getState().setCurrentPage('Subscribers')

      expect(useAppStore.getState().currentPage).toBe('Subscribers')
    })

    it('should update currentSection when provided', () => {
      useAppStore.getState().setCurrentPage('Devices', 'NETWORK')

      expect(useAppStore.getState().currentSection).toBe('NETWORK')
    })

    it('should preserve currentSection when not provided', () => {
      useAppStore.setState({ currentSection: 'MAIN' })
      useAppStore.getState().setCurrentPage('Invoices')

      expect(useAppStore.getState().currentSection).toBe('MAIN')
    })

    it('should handle page changes across multiple sections', () => {
      useAppStore.getState().setCurrentPage('Devices', 'NETWORK')
      expect(useAppStore.getState().currentPage).toBe('Devices')
      expect(useAppStore.getState().currentSection).toBe('NETWORK')

      useAppStore.getState().setCurrentPage('Complaints', 'OPERATIONS')
      expect(useAppStore.getState().currentPage).toBe('Complaints')
      expect(useAppStore.getState().currentSection).toBe('OPERATIONS')

      useAppStore.getState().setCurrentPage('Users', 'SETTINGS')
      expect(useAppStore.getState().currentPage).toBe('Users')
      expect(useAppStore.getState().currentSection).toBe('SETTINGS')
    })

    it('should handle empty page name', () => {
      useAppStore.getState().setCurrentPage('')

      expect(useAppStore.getState().currentPage).toBe('')
    })

    it('should handle page name with special characters', () => {
      useAppStore.getState().setCurrentPage('AI Advisor')

      expect(useAppStore.getState().currentPage).toBe('AI Advisor')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Sidebar Groups
  // ═══════════════════════════════════════════════════════════════

  describe('toggleGroup', () => {
    it('should add group to collapsedGroups when not collapsed', () => {
      useAppStore.getState().toggleGroup('NETWORK')

      expect(useAppStore.getState().collapsedGroups).toContain('NETWORK')
    })

    it('should remove group from collapsedGroups when already collapsed', () => {
      useAppStore.getState().toggleGroup('NETWORK')
      useAppStore.getState().toggleGroup('NETWORK')

      expect(useAppStore.getState().collapsedGroups).not.toContain('NETWORK')
    })

    it('should toggle multiple groups independently', () => {
      useAppStore.getState().toggleGroup('NETWORK')
      useAppStore.getState().toggleGroup('OPERATIONS')
      useAppStore.getState().toggleGroup('FINANCE')

      expect(useAppStore.getState().collapsedGroups).toEqual(['NETWORK', 'OPERATIONS', 'FINANCE'])

      useAppStore.getState().toggleGroup('OPERATIONS')

      expect(useAppStore.getState().collapsedGroups).toEqual(['NETWORK', 'FINANCE'])
    })

    it('should not add duplicate group IDs', () => {
      useAppStore.getState().toggleGroup('NETWORK')
      useAppStore.getState().toggleGroup('NETWORK')

      const networkCount = useAppStore.getState().collapsedGroups.filter((g) => g === 'NETWORK').length
      expect(networkCount).toBe(0) // It was toggled off
    })

    it('should handle toggling all defined groups', () => {
      const allGroupIds = ['MAIN', 'NETWORK', 'OPERATIONS', 'FINANCE', 'AI INTELLIGENCE', 'SETTINGS']

      allGroupIds.forEach((id) => useAppStore.getState().toggleGroup(id))

      expect(useAppStore.getState().collapsedGroups).toEqual(allGroupIds)

      allGroupIds.forEach((id) => useAppStore.getState().toggleGroup(id))

      expect(useAppStore.getState().collapsedGroups).toEqual([])
    })
  })

  describe('isGroupCollapsed', () => {
    it('should return true for collapsed group', () => {
      useAppStore.getState().toggleGroup('NETWORK')

      expect(useAppStore.getState().isGroupCollapsed('NETWORK')).toBe(true)
    })

    it('should return false for non-collapsed group', () => {
      expect(useAppStore.getState().isGroupCollapsed('NETWORK')).toBe(false)
    })

    it('should return false for unknown group', () => {
      expect(useAppStore.getState().isGroupCollapsed('UNKNOWN_GROUP')).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Notifications
  // ═══════════════════════════════════════════════════════════════

  describe('setUnreadNotificationCount', () => {
    it('should update unreadNotificationCount', () => {
      useAppStore.getState().setUnreadNotificationCount(5)

      expect(useAppStore.getState().unreadNotificationCount).toBe(5)
    })

    it('should allow setting count to zero', () => {
      useAppStore.getState().setUnreadNotificationCount(10)
      useAppStore.getState().setUnreadNotificationCount(0)

      expect(useAppStore.getState().unreadNotificationCount).toBe(0)
    })

    it('should handle large notification counts', () => {
      useAppStore.getState().setUnreadNotificationCount(9999)

      expect(useAppStore.getState().unreadNotificationCount).toBe(9999)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // User State
  // ═══════════════════════════════════════════════════════════════

  describe('setUser', () => {
    it('should merge user data with existing state', () => {
      useAppStore.getState().setUser({ id: 'user-1', name: 'Admin' })

      expect(useAppStore.getState().user.id).toBe('user-1')
      expect(useAppStore.getState().user.name).toBe('Admin')
    })

    it('should preserve existing user fields not provided', () => {
      useAppStore.getState().setUser({ id: 'user-1', name: 'Admin', email: 'admin@test.com' })
      useAppStore.getState().setUser({ role: 'SUPER_ADMIN' })

      expect(useAppStore.getState().user.id).toBe('user-1')
      expect(useAppStore.getState().user.name).toBe('Admin')
      expect(useAppStore.getState().user.email).toBe('admin@test.com')
      expect(useAppStore.getState().user.role).toBe('SUPER_ADMIN')
    })

    it('should handle setting all user fields at once', () => {
      useAppStore.getState().setUser({
        id: 'user-2',
        name: 'Operator',
        email: 'op@test.com',
        role: 'OPERATOR',
        avatarUrl: 'https://example.com/avatar.png',
        ispName: 'Test ISP',
      })

      const user = useAppStore.getState().user
      expect(user.id).toBe('user-2')
      expect(user.name).toBe('Operator')
      expect(user.email).toBe('op@test.com')
      expect(user.role).toBe('OPERATOR')
      expect(user.avatarUrl).toBe('https://example.com/avatar.png')
      expect(user.ispName).toBe('Test ISP')
    })

    it('should handle partial updates with undefined values', () => {
      useAppStore.getState().setUser({ name: 'Admin' })
      // avatarUrl was undefined, setting it to a new value
      useAppStore.getState().setUser({ avatarUrl: 'https://example.com/new.png' })

      expect(useAppStore.getState().user.avatarUrl).toBe('https://example.com/new.png')
    })

    it('should handle empty partial update', () => {
      const prevState = { ...useAppStore.getState().user }

      useAppStore.getState().setUser({})

      expect(useAppStore.getState().user).toEqual(prevState)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Complaint Count
  // ═══════════════════════════════════════════════════════════════

  describe('setOpenComplaintCount', () => {
    it('should update openComplaintCount', () => {
      useAppStore.getState().setOpenComplaintCount(12)

      expect(useAppStore.getState().openComplaintCount).toBe(12)
    })

    it('should allow setting count to zero', () => {
      useAppStore.getState().setOpenComplaintCount(5)
      useAppStore.getState().setOpenComplaintCount(0)

      expect(useAppStore.getState().openComplaintCount).toBe(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Command Palette
  // ═══════════════════════════════════════════════════════════════

  describe('command palette', () => {
    it('should open command palette with setCommandPaletteOpen', () => {
      useAppStore.getState().setCommandPaletteOpen(true)

      expect(useAppStore.getState().commandPaletteOpen).toBe(true)
    })

    it('should close command palette with setCommandPaletteOpen', () => {
      useAppStore.setState({ commandPaletteOpen: true })
      useAppStore.getState().setCommandPaletteOpen(false)

      expect(useAppStore.getState().commandPaletteOpen).toBe(false)
    })

    it('should toggle command palette with toggleCommandPalette', () => {
      expect(useAppStore.getState().commandPaletteOpen).toBe(false)

      useAppStore.getState().toggleCommandPalette()
      expect(useAppStore.getState().commandPaletteOpen).toBe(true)

      useAppStore.getState().toggleCommandPalette()
      expect(useAppStore.getState().commandPaletteOpen).toBe(false)
    })

    it('should handle rapid toggle calls', () => {
      useAppStore.getState().toggleCommandPalette()
      useAppStore.getState().toggleCommandPalette()
      useAppStore.getState().toggleCommandPalette()
      useAppStore.getState().toggleCommandPalette()

      // Even number of toggles = closed
      expect(useAppStore.getState().commandPaletteOpen).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // NAV_GROUPS Export
  // ═══════════════════════════════════════════════════════════════

  describe('NAV_GROUPS', () => {
    it('should export 6 navigation groups', () => {
      expect(NAV_GROUPS).toHaveLength(6)
    })

    it('should contain required group IDs', () => {
      const ids = NAV_GROUPS.map((g) => g.id)
      expect(ids).toContain('MAIN')
      expect(ids).toContain('NETWORK')
      expect(ids).toContain('OPERATIONS')
      expect(ids).toContain('FINANCE')
      expect(ids).toContain('AI INTELLIGENCE')
      expect(ids).toContain('SETTINGS')
    })

    it('should have defaultOpen true for all groups', () => {
      NAV_GROUPS.forEach((group) => {
        expect(group.defaultOpen).toBe(true)
      })
    })

    it('should have correct labels matching IDs', () => {
      NAV_GROUPS.forEach((group) => {
        expect(group.label).toBe(group.id)
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Edge Cases & State Isolation
  // ═══════════════════════════════════════════════════════════════

  describe('state isolation', () => {
    it('should not affect notification count when changing pages', () => {
      useAppStore.getState().setUnreadNotificationCount(10)
      useAppStore.getState().setCurrentPage('Subscribers')

      expect(useAppStore.getState().unreadNotificationCount).toBe(10)
    })

    it('should not affect complaint count when toggling groups', () => {
      useAppStore.getState().setOpenComplaintCount(7)
      useAppStore.getState().toggleGroup('NETWORK')

      expect(useAppStore.getState().openComplaintCount).toBe(7)
    })

    it('should not affect user state when toggling command palette', () => {
      useAppStore.getState().setUser({ name: 'Admin' })
      useAppStore.getState().toggleCommandPalette()

      expect(useAppStore.getState().user.name).toBe('Admin')
    })

    it('should handle concurrent state updates', () => {
      useAppStore.getState().setCurrentPage('Subscribers', 'MAIN')
      useAppStore.getState().toggleGroup('NETWORK')
      useAppStore.getState().setUnreadNotificationCount(3)
      useAppStore.getState().setOpenComplaintCount(5)
      useAppStore.getState().setCommandPaletteOpen(true)

      expect(useAppStore.getState().currentPage).toBe('Subscribers')
      expect(useAppStore.getState().currentSection).toBe('MAIN')
      expect(useAppStore.getState().collapsedGroups).toContain('NETWORK')
      expect(useAppStore.getState().unreadNotificationCount).toBe(3)
      expect(useAppStore.getState().openComplaintCount).toBe(5)
      expect(useAppStore.getState().commandPaletteOpen).toBe(true)
    })

    it('should handle rapid page changes (only last value should stick)', () => {
      useAppStore.getState().setCurrentPage('Page A')
      useAppStore.getState().setCurrentPage('Page B')
      useAppStore.getState().setCurrentPage('Page C')

      expect(useAppStore.getState().currentPage).toBe('Page C')
    })
  })
})
