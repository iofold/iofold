'use client'

import { useRouter as useNextRouter } from 'next/navigation'
import NProgress from 'nprogress'
import { useCallback, useMemo } from 'react'

export function useRouterWithProgress() {
  const router = useNextRouter()

  const push = useCallback(
    (href: string, options?: Parameters<typeof router.push>[1]) => {
      NProgress.start()
      return router.push(href, options)
    },
    [router]
  )

  const replace = useCallback(
    (href: string, options?: Parameters<typeof router.replace>[1]) => {
      NProgress.start()
      return router.replace(href, options)
    },
    [router]
  )

  const back = useCallback(() => {
    NProgress.start()
    return router.back()
  }, [router])

  const forward = useCallback(() => {
    NProgress.start()
    return router.forward()
  }, [router])

  return useMemo(
    () => ({
      ...router,
      push,
      replace,
      back,
      forward,
    }),
    [router, push, replace, back, forward]
  )
}

// Alias for easier migration
export { useRouterWithProgress as useRouter }
