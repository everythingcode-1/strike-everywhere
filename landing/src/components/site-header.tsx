"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { navLinks, siteConfig } from "@/lib/site";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background">
      <div className="container-page flex h-16 items-center justify-between gap-5">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2.5 rounded-md focus-visible:outline-offset-4"
          aria-label={`${siteConfig.name} home`}
        >
          <Image
            src="/brand/mark-48.png"
            alt=""
            width={28}
            height={28}
            className="rounded-sm"
          />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">
            Strike <span className="hidden font-normal text-muted-foreground min-[360px]:inline">Everywhere</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-sm py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-offset-4"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            asChild
            className="h-10 rounded-lg bg-primary px-4 text-primary-foreground hover:bg-primary/90"
          >
            <a href="#install">Install</a>
          </Button>
          <button
            type="button"
            className="grid h-10 min-w-11 place-items-center rounded-lg border border-white/40 px-3 text-sm text-muted-foreground transition-colors hover:border-white/60 hover:text-foreground focus-visible:outline-offset-4 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        className={cn("border-t border-white/10 md:hidden", open ? "block" : "hidden")}
      >
        <nav className="container-page py-3" aria-label="Mobile">
          <ul className="m-0 flex list-none flex-col p-0">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="flex min-h-11 items-center rounded-md px-1 text-[15px] text-muted-foreground hover:text-foreground focus-visible:outline-offset-2"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
