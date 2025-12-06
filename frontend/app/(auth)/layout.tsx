import { CheckCircle2, Code2, Zap, LineChart } from 'lucide-react'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Marketing Content - Left Side */}
      <div className="lg:w-1/2 bg-gradient-to-br from-primary/10 via-accent/10 to-background p-8 lg:p-12 flex flex-col justify-center">
        <div className="max-w-xl mx-auto">
          {/* Logo & Branding */}
          <div className="mb-8 lg:mb-12">
            <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-4">
              iofold
            </h1>
            <div className="inline-block px-3 py-1 bg-primary/20 text-primary rounded-full text-sm font-medium">
              Open Source
            </div>
          </div>

          {/* Hero */}
          <div className="mb-8 lg:mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4 leading-tight">
              Self-improving agents with automatic evals & prompt optimization
            </h2>
            <p className="text-lg text-muted-foreground">
              Transparent evaluation for transparent AI
            </p>
          </div>

          {/* Value Propositions */}
          <div className="space-y-6 mb-8 lg:mb-12">
            <div className="flex items-start gap-4">
              <div className="bg-primary/20 p-2 rounded-lg flex-shrink-0">
                <Code2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  Code-based evals
                </h3>
                <p className="text-muted-foreground text-sm">
                  TypeScript checks, not slow LLM-as-judge. Fast, deterministic evaluation that scales.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-primary/20 p-2 rounded-lg flex-shrink-0">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  Continuous improvement
                </h3>
                <p className="text-muted-foreground text-sm">
                  Fold back feedback into automatic prompt optimization. Your agents improve with every run.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-primary/20 p-2 rounded-lg flex-shrink-0">
                <LineChart className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  Meta-prompting
                </h3>
                <p className="text-muted-foreground text-sm">
                  Optimize instructions on-the-fly from real usage. Gate deployments and iterate automatically.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-primary/20 p-2 rounded-lg flex-shrink-0">
                <CheckCircle2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  Seamless integrations
                </h3>
                <p className="text-muted-foreground text-sm">
                  Works with Langfuse, LangSmith, OpenAI, and more. Connect your existing observability stack.
                </p>
              </div>
            </div>
          </div>

          {/* Social Proof / Problem Statement */}
          <div className="border-l-4 border-primary/40 pl-4 py-2">
            <p className="text-muted-foreground italic">
              &ldquo;Agents don&apos;t improve themselves. User feedback gets lost in logs, never improving prompts.
              Evaluation scripts rot as agent behavior evolves.&rdquo;
            </p>
            <p className="text-sm text-primary mt-2 font-medium">
              It&apos;s time to automate the feedback loop.
            </p>
          </div>
        </div>
      </div>

      {/* Auth Form - Right Side */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  )
}
