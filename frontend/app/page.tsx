import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plug, ThumbsUp, Zap, Settings, FileText, FolderOpen, Code2, ArrowRight } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-16 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            AI-Powered Evaluation Generation
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
            Welcome to iofold
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Automatically generate high-quality eval functions from your trace examples.
            Connect, annotate, and let AI do the rest.
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild size="lg" className="group">
              <Link href="/integrations">
                Get Started
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/agents">View Agents</Link>
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <Card className="p-6 group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <Plug className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Connect</h3>
            <p className="text-sm text-muted-foreground">
              Integrate with Langfuse, Langsmith, or OpenAI to import traces from your existing tools
            </p>
          </Card>

          <Card className="p-6 group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <ThumbsUp className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Annotate</h3>
            <p className="text-sm text-muted-foreground">
              Review traces and provide feedback with simple thumbs up/down annotations
            </p>
          </Card>

          <Card className="p-6 group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <Zap className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Generate</h3>
            <p className="text-sm text-muted-foreground">
              Automatically create Python eval functions from your labeled examples
            </p>
          </Card>
        </div>

        {/* Quick Links Section */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Quick Links</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Link href="/integrations">
              <Card interactive className="p-4 flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Settings className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold group-hover:text-primary transition-colors">Integrations</h3>
                  <p className="text-sm text-muted-foreground">
                    Manage your platform connections
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </Card>
            </Link>

            <Link href="/traces">
              <Card interactive className="p-4 flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <FileText className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold group-hover:text-primary transition-colors">Traces</h3>
                  <p className="text-sm text-muted-foreground">
                    Browse and annotate imported traces
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </Card>
            </Link>

            <Link href="/agents">
              <Card interactive className="p-4 flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <FolderOpen className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold group-hover:text-primary transition-colors">Agents</h3>
                  <p className="text-sm text-muted-foreground">
                    Manage agents and feedback
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </Card>
            </Link>

            <Link href="/evals">
              <Card interactive className="p-4 flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Code2 className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold group-hover:text-primary transition-colors">Evals</h3>
                  <p className="text-sm text-muted-foreground">
                    View generated eval functions
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
