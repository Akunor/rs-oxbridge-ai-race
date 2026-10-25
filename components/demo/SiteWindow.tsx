"use client";

import type { ReactNode } from "react";

/** Fake browser chrome for the agent-journey visualization. */
export function SiteWindow({
  url,
  agentRole,
  stepCaption,
  flagged,
  children,
}: {
  url: string;
  agentRole: string;
  stepCaption: string;
  flagged?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`site-window${flagged ? " site-window--flagged" : ""}`} aria-label="Agent journey through the site">
      {flagged && (
        <div className="site-window-flag" role="alert">
          Payment attempt flagged by PayeeGuard · agent will not sign
        </div>
      )}
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
