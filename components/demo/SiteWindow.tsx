"use client";

import type { ReactNode } from "react";

/** Fake browser chrome for the agent-journey visualization. */
export function SiteWindow({
  url,
  agentRole,
  stepCaption,
  children,
}: {
  url: string;
  agentRole: string;
  stepCaption: string;
  children: ReactNode;
}) {
  return (
    <section className="site-window" aria-label="Agent journey through the site">
      <div className="site-window-chrome">
        <span className="site-window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="site-window-url mono">{url}</span>
        <span className="site-window-role">{agentRole}</span>
      </div>
      <div className="site-window-body">{children}</div>
      <div className="site-window-caption">
        <span className="eyebrow">Agent journey</span>
        <span>{stepCaption}</span>
      </div>
    </section>
  );
}
