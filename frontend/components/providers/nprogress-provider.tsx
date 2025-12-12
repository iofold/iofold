'use client'

import { useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({
  showSpinner: false,
  minimum: 0.1,
  easing: 'ease',
  speed: 300,
  trickleSpeed: 200,
})

function isInternalUrl(href: string): boolean {
  if (!href) return false
  // External URLs start with http://, https://, or //
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
    return false
  }
  // Hash-only links or javascript: are not navigation
  if (href.startsWith('#') || href.startsWith('javascript:')) {
    return false
  }
  return true
}

function isModifiedEvent(event: MouseEvent): boolean {
  return !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
}

export function NProgressProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Complete progress when pathname changes
  useEffect(() => {
    NProgress.done()
  }, [pathname])

  // Global click interceptor for all internal links
  // This catches any Link components that weren't replaced with NavLink
  const handleClick = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement
    const anchor = target.closest('a')

    if (!anchor) return

    const href = anchor.getAttribute('href')
    if (!href) return

    // Skip if:
    // - Modifier key held (new tab)
    // - External URL
    // - Target is _blank
    // - Download attribute present
    // - Event already prevented
    if (
      isModifiedEvent(event) ||
      !isInternalUrl(href) ||
      anchor.target === '_blank' ||
      anchor.hasAttribute('download') ||
      event.defaultPrevented
    ) {
      return
    }

    // Start progress bar for internal navigation
    NProgress.start()
  }, [])

  useEffect(() => {
    // Add global click listener
    document.addEventListener('click', handleClick, { capture: true })

    return () => {
      document.removeEventListener('click', handleClick, { capture: true })
    }
  }, [handleClick])

  // Safety timeout to prevent stuck progress bar
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (NProgress.isStarted()) {
        NProgress.done()
      }
    }, 10000) // 10 second timeout

    return () => clearTimeout(timeout)
  }, [pathname])

  return <>{children}</>
}
