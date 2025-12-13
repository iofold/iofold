'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

const SIDEBAR_STORAGE_KEY = 'iofold-sidebar-expanded'

interface SidebarContextType {
  isExpanded: boolean
  toggle: () => void
  expand: () => void
  collapse: () => void
}

const SidebarContext = createContext<SidebarContextType | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load saved state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (saved !== null) {
      setIsExpanded(saved === 'true')
    }
    setIsHydrated(true)
  }, [])

  // Persist state to localStorage when it changes (after hydration)
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isExpanded))
    }
  }, [isExpanded, isHydrated])

  const toggle = useCallback(() => setIsExpanded((prev) => !prev), [])
  const expand = useCallback(() => setIsExpanded(true), [])
  const collapse = useCallback(() => setIsExpanded(false), [])

  return (
    <SidebarContext.Provider value={{ isExpanded, toggle, expand, collapse }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}
