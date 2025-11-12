import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            Welcome to iofold
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Automatically generate high-quality eval functions from your trace examples
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild size="lg">
              <Link href="/integrations">Get Started</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/eval-sets">View Eval Sets</Link>
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="p-6">
            <div className="text-3xl mb-3">🔌</div>
            <h3 className="text-lg font-semibold mb-2">Connect</h3>
            <p className="text-sm text-muted-foreground">
              Integrate with Langfuse, Langsmith, or OpenAI to import traces
            </p>
          </Card>

          <Card className="p-6">
            <div className="text-3xl mb-3">👍</div>
            <h3 className="text-lg font-semibold mb-2">Annotate</h3>
            <p className="text-sm text-muted-foreground">
              Review traces and provide feedback with simple thumbs up/down
            </p>
          </Card>

          <Card className="p-6">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-lg font-semibold mb-2">Generate</h3>
            <p className="text-sm text-muted-foreground">
              Automatically create Python eval functions from your examples
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold mb-4">Quick Links</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Link href="/integrations">
              <Card className="p-4 hover:bg-accent transition-colors cursor-pointer">
                <h3 className="font-semibold mb-1">Integrations</h3>
                <p className="text-sm text-muted-foreground">
                  Manage your platform connections
                </p>
              </Card>
            </Link>

            <Link href="/traces">
              <Card className="p-4 hover:bg-accent transition-colors cursor-pointer">
                <h3 className="font-semibold mb-1">Traces</h3>
                <p className="text-sm text-muted-foreground">
                  Browse and annotate imported traces
                </p>
              </Card>
            </Link>

            <Link href="/eval-sets">
              <Card className="p-4 hover:bg-accent transition-colors cursor-pointer">
                <h3 className="font-semibold mb-1">Eval Sets</h3>
                <p className="text-sm text-muted-foreground">
                  Organize feedback collections
                </p>
              </Card>
            </Link>

            <Link href="/evals">
              <Card className="p-4 hover:bg-accent transition-colors cursor-pointer">
                <h3 className="font-semibold mb-1">Evals</h3>
                <p className="text-sm text-muted-foreground">
                  View generated eval functions
                </p>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
