import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "/#features", label: "Features" }, { href: "/#how", label: "How it works" }, { href: "/#pricing", label: "Pricing" }, { href: "/fundraiser/wanjiku-building-fund", label: "Example page" },
  ];
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {links.map((l) => <a key={l.href} href={l.href} className="hover:text-foreground">{l.label}</a>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost"><Link to="/login" search={{ campaignCode: undefined, invite: undefined }}>Log in</Link></Button>
          <Button asChild><Link to="/register" search={{ campaignCode: undefined, invite: undefined }}>Get started</Link></Button>
        </div>
        <button type="button" className="grid h-11 w-11 place-items-center rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="public-mobile-navigation">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {open && (
        <nav id="public-mobile-navigation" aria-label="Mobile navigation" hidden={!open} className="space-y-1 border-t px-4 py-4 md:hidden">
          {links.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{l.label}</a>)}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button asChild variant="outline"><Link to="/login" search={{ campaignCode: undefined, invite: undefined }} onClick={() => setOpen(false)}>Log in</Link></Button>
            <Button asChild><Link to="/register" search={{ campaignCode: undefined, invite: undefined }} onClick={() => setOpen(false)}>Get started</Link></Button>
          </div>
        </nav>
      )}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">Fundraising made simple. Helping organisations and communities across Kenya raise funds together.</p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold">Platform</p>
          <a href="/#features" className="block text-muted-foreground hover:text-foreground">Features</a>
          <a href="/#pricing" className="block text-muted-foreground hover:text-foreground">Pricing</a>
          <Link to="/register" search={{ campaignCode: undefined, invite: undefined }} className="block text-muted-foreground hover:text-foreground">Register organisation</Link>
        </div>
      </div>
      <div className="border-t py-5 text-center text-xs text-muted-foreground">© 2026 Fundraise · Nairobi, Kenya</div>
    </footer>
  );
}
