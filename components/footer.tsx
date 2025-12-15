import Link from "next/link"

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="w-full border-t border-border bg-secondary py-6">
      <div className="container mx-auto px-4 space-y-4">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          {/* Copyright notice */}
          <div className="font-mono text-sm text-muted-foreground">
            © {currentYear} iCart Arcade. All rights reserved.
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            <Link href="/terms" className="font-mono text-sm text-muted-foreground hover:text-accent transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="font-mono text-sm text-muted-foreground hover:text-accent transition-colors">
              Privacy Policy
            </Link>
            <Link href="/bug-report" className="font-mono text-sm text-muted-foreground hover:text-accent transition-colors">
              Report a Bug
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
