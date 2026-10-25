"use client";

// Proof-of-control tokens this browser has collected (from /merchant/verify). Sent with each
// check so a verification works even before shared storage is set up.
const KEY = "payeeguard:attestations";

export function loadAttestations(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string").slice(-20) : [];
  } catch {
    return [];
  }
}

export function saveAttestation(token: string): void {
  try {
    const list = loadAttestations().filter((t) => t !== token);
    window.localStorage.setItem(KEY, JSON.stringify([...list, token].slice(-20)));
  } catch {
    // Storage blocked (private mode): the shared directory still records the verification.
  }
}
