import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

function App() {
  return (
    <div className="min-h-svh bg-gradient-to-b from-background to-muted">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 sm:py-24">
        <div className="flex flex-col items-center text-center space-y-8">
          {/* Badge */}
          <Badge variant="secondary" className="px-4 py-1.5 text-sm">
            Powered by Vite + Tailwind v4 + shadcn/ui
          </Badge>

          {/* Main Heading */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-foreground via-foreground/80 to-foreground bg-clip-text">
              ViteJS
            </span>
            <span className="text-primary"> Ready</span>
          </h1>

          {/* Subtitle */}
          <p className="max-w-2xl text-lg sm:text-xl text-muted-foreground">
            Your project is set up with the modern stack. Start building something amazing.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Button size="lg" className="min-w-40">
              Get Started
            </Button>
            <Button size="lg" variant="outline" className="min-w-40">
              Documentation
            </Button>
          </div>

          {/* Tech Stack */}
          <div className="pt-12 flex flex-wrap justify-center gap-8 text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-yellow-500" />
              <span className="text-sm font-medium">Vite</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-cyan-500" />
              <span className="text-sm font-medium">Tailwind v4</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-blue-500" />
              <span className="text-sm font-medium">React</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-neutral-500" />
              <span className="text-sm font-medium">shadcn/ui</span>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="container mx-auto px-4 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: "Lightning Fast", desc: "Instant HMR and optimized builds with Vite" },
            { title: "Type Safe", desc: "Full TypeScript support out of the box" },
            { title: "Beautiful UI", desc: "Pre-built components with shadcn/ui" },
          ].map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border bg-card p-6 transition-colors hover:bg-accent"
            >
              <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8">
        <p className="text-center text-sm text-muted-foreground">
          Edit <code className="font-mono bg-muted px-1.5 py-0.5 rounded">src/App.tsx</code> to get started
        </p>
      </footer>
    </div>
  )
}

export default App
