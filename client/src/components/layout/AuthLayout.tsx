import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto my-auto w-full max-w-md py-10">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="hidden bg-ink p-12 text-ink-foreground lg:flex lg:flex-col lg:justify-end">
        <p className="font-display text-4xl leading-tight">"We raised more for our sanctuary in three months than in the previous two years."</p>
        <p className="mt-4 text-sm opacity-70">Peter Otieno · Grace Church, Nairobi</p>
      </div>
    </div>
  );
}
