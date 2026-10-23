"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type CopyCommandProps = {
  command: string;
  label: string;
};

export function CopyCommand({ command, label }: CopyCommandProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0f0f0e]">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-2.5">
        <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
          onClick={copy}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6 text-foreground">
        <code>{command}</code>
      </pre>
      <p className="sr-only" role="status" aria-live="polite">
        {copied ? "Command copied to the clipboard." : ""}
      </p>
      {failed ? (
        <p className="border-t border-white/10 px-4 py-2 text-xs text-[#ff8fa3]">
          Clipboard access was blocked. Select the command and copy it manually.
        </p>
      ) : null}
    </div>
  );
}
