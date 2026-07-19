import { useIsMutating } from '@tanstack/react-query';
import { Github } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { ViewToggle } from './ViewToggle';

export function Header() {
  const generating = useIsMutating() > 0;

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 dark:border-zinc-800/80 dark:bg-zinc-950/75 dark:supports-[backdrop-filter]:bg-zinc-950/60">
      {/* 3-column grid: 1fr | auto | 1fr → the centre column is perfectly
          centred regardless of how wide the logo or the action cluster get.
          This makes the ViewToggle line up with the gap between the Input
          and Output columns in the main grid below. */}
      <div className="mx-auto max-w-[1600px] px-6 py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        {/* ── Logo + Brand ─────────────────────────────────────────── */}
        <a
          href="/"
          className="group inline-flex items-center gap-3 rounded-lg px-1 py-1 -mx-1 transition-opacity hover:opacity-90 justify-self-start"
          aria-label="SHACL to Natural Language — Home"
        >
          <Logo generating={generating} />
        </a>

        {/* ── View mode toggle ─────────────────────────────────────── */}
        <div className="justify-self-center">
          <ViewToggle />
        </div>

        {/* ── Action cluster ───────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 justify-self-end">
          <IconLink
            href="https://github.com/Simon-Jost/shacl-nl-interface"
            label="View on GitHub"
          >
            <Github className="h-4 w-4" />
          </IconLink>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

function Logo({ generating }: { generating: boolean }) {
  return (
    <svg
      viewBox="0 12 620 70"
      xmlns="http://www.w3.org/2000/svg"
      className="h-11 w-auto"
      aria-label="SHACL to Natural Language"
    >
      <defs>
        <linearGradient id="arrowGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" />
          <stop offset="100%" stopColor="#3b5bdb" />
        </linearGradient>
      </defs>
      <g transform="translate(10, 12)" className={generating ? 'logo-active' : ''}>
        <line x1="16" y1="32" x2="34" y2="14" className="logo-edge-static" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="16" y1="38" x2="34" y2="56" className="logo-edge-static" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="46" y1="14" x2="60" y2="29" className="logo-edge-brand" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="46" y1="56" x2="60" y2="41" className="logo-edge-brand" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="40" y1="18" x2="40" y2="52" className="logo-edge-dashed" strokeWidth="1.5" strokeDasharray="4 3" />
        <circle cx="10" cy="35" r="8" className="logo-node-dark" />
        <circle cx="40" cy="10" r="8" className="logo-node-brand logo-pulse-1" />
        <circle cx="40" cy="60" r="8" className="logo-node-brand logo-pulse-2" />
        <circle cx="68" cy="35" r="8" className="logo-node-dark logo-pulse-3" />
        <circle cx="68" cy="35" r="14" fill="none" className="logo-ring" strokeWidth="1.8" strokeDasharray="5 3" opacity="0.55" />
        <polyline points="63,35 66.5,39.5 74,29" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="98" y="54" fontSize="30" fontWeight="800" letterSpacing="-1" className="logo-text-dark">SHACL</text>
      <g transform="translate(228, 28)">
        <rect x="0" y="18" width="44" height="4" rx="2" fill="url(#arrowGrad)" />
        <polygon points="44,11 62,20 44,29" fill="#3b5bdb" />
      </g>
      <text x="304" y="54" fontSize="30" fontWeight="800" letterSpacing="-1" fill="#3b5bdb">Natural Language</text>
    </svg>
  );
}

function IconLink({
  href, label, children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors"
    >
      {children}
    </a>
  );
}
