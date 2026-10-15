import Link from 'next/link';

const projects = [
  {
    title: 'JARVIS Voice Assistant',
    description:
      'A local-first AI assistant with voice input, memory, and a desktop/mobile control surface.',
    stack: 'Flutter, Python, Ollama',
  },
  {
    title: 'Realtime Automation Console',
    description:
      'A command and telemetry hub for orchestrating browser flows and task automation from one place.',
    stack: 'Next.js, TypeScript, APIs',
  },
  {
    title: 'Personal AI Memory Engine',
    description:
      'Persistent memory layer that keeps context across sessions for personalized responses.',
    stack: 'Python, JSON persistence',
  },
];

export default function PortfolioPage() {
  return (
    <main className="relative min-h-screen bg-transparent text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,220,255,0.18),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(255,140,0,0.2),transparent_40%),radial-gradient(circle_at_50%_80%,rgba(0,110,255,0.12),transparent_45%)]" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pt-24 pb-12 md:px-10">
        <nav className="mb-16 flex items-center justify-between">
          <div className="font-mono text-xs tracking-[0.3em] text-cyan-300">
            CMONS // PERSONAL SITE
          </div>
          <Link
            href="/"
            className="rounded-full border border-cyan-300/50 bg-cyan-400/10 px-4 py-2 text-xs font-semibold tracking-wider text-cyan-200 transition hover:bg-cyan-300/20"
          >
            OPEN AI
          </Link>
        </nav>

        <div className="grid gap-12 md:grid-cols-[1.3fr_1fr] md:items-end">
          <div>
            <p className="mb-4 font-mono text-xs tracking-[0.3em] text-orange-300 uppercase">
              Builder. Hacker. Creator.
            </p>
            <h1 className="text-5xl leading-[0.95] font-black tracking-tight text-white md:text-7xl">
              This is
              <span className="block bg-gradient-to-r from-cyan-300 via-sky-200 to-orange-300 bg-clip-text text-transparent">
                my website.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-base text-slate-200 md:text-lg">
              I design and ship AI-powered tools that run locally, move fast, and stay under my
              control. No fluff. Just systems that work.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <a
                href="#projects"
                className="rounded-md bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-cyan-200"
              >
                See Projects
              </a>
              <a
                href="#about"
                className="rounded-md border border-white/30 px-5 py-3 text-sm font-bold text-white transition hover:border-white/60"
              >
                About Me
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-slate-950/55 p-6 shadow-[0_0_50px_rgba(0,200,255,0.08)] backdrop-blur">
            <p className="font-mono text-xs tracking-[0.25em] text-cyan-300 uppercase">
              Current Focus
            </p>
            <ul className="mt-4 space-y-3 text-sm text-slate-200">
              <li>• Local AI stack with Ollama + Python APIs</li>
              <li>• Persistent memory and personalized assistants</li>
              <li>• Cross-platform apps with Flutter</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="about" className="relative mx-auto w-full max-w-6xl px-6 py-16 md:px-10">
        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-8 md:p-12">
          <h2 className="text-3xl font-bold text-white md:text-4xl">About</h2>
          <p className="mt-4 max-w-3xl text-slate-200">
            I build practical AI products: voice assistants, automation tools, and interactive
            interfaces. My approach is direct, hands-on, and performance-driven, with a focus on
            ownership and privacy.
          </p>
        </div>
      </section>

      <section id="projects" className="relative mx-auto w-full max-w-6xl px-6 py-16 md:px-10">
        <h2 className="text-3xl font-bold text-white md:text-4xl">Projects</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.title}
              className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 transition hover:-translate-y-1 hover:border-cyan-300/50"
            >
              <h3 className="text-lg font-semibold text-white">{project.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{project.description}</p>
              <p className="mt-4 font-mono text-xs tracking-wider text-orange-300">
                {project.stack}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="contact" className="relative mx-auto w-full max-w-6xl px-6 pt-6 pb-20 md:px-10">
        <div className="rounded-3xl border border-cyan-300/30 bg-cyan-400/10 p-8 md:p-10">
          <h2 className="text-3xl font-bold text-white md:text-4xl">Let&apos;s Build</h2>
          <p className="mt-3 max-w-2xl text-slate-100">
            Want something custom? AI workflows, desktop tools, voice systems, or full products.
          </p>
          <p className="mt-6 font-mono text-sm tracking-wider text-cyan-200">email@example.com</p>
        </div>
      </section>
    </main>
  );
}
