'use client'

import { Button, ButtonProps } from "./button"

interface LoadingButtonProps extends ButtonProps {
  loading?: boolean
  loadingText?: string
}

export function LoadingButton({
  loading,
  loadingText,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button loading={loading} {...props}>
      {loading && loadingText ? loadingText : children}
    </Button>
  )
}
