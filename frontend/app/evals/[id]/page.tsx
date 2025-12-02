import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EvalDetailPage({ params }: PageProps) {
  const { id } = await params
  redirect(`/evals?selected=${id}`)
}
