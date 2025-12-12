'use client'

import Link, { LinkProps } from 'next/link'
import NProgress from 'nprogress'
import { forwardRef, MouseEvent, AnchorHTMLAttributes } from 'react'

type NavLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children: React.ReactNode
  }

function isExternalUrl(href: string | URL): boolean {
  if (typeof href !== 'string') return false
  return href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')
}

function isModifiedEvent(event: MouseEvent): boolean {
  return !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
}

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  function NavLink({ href, onClick, children, ...props }, ref) {
    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
      // Call original onClick if provided
      onClick?.(e)

      // Don't trigger progress if:
      // - Event was prevented
      // - Modifier key was held (opening in new tab)
      // - It's an external URL
      // - Target is _blank
      if (
        e.defaultPrevented ||
        isModifiedEvent(e) ||
        isExternalUrl(href as string) ||
        props.target === '_blank'
      ) {
        return
      }

      // Start progress bar for internal navigation
      NProgress.start()
    }

    return (
      <Link ref={ref} href={href} onClick={handleClick} {...props}>
        {children}
      </Link>
    )
  }
)

NavLink.displayName = 'NavLink'

// Also export as default for easier imports
export default NavLink
