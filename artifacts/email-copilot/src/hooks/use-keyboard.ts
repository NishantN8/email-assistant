import { useEffect, useCallback } from "react";

export interface KeyboardNavOptions {
  onNext: () => void;        // j — next email
  onPrev: () => void;        // k — previous email
  onReply: () => void;       // r — reply
  onArchive: () => void;     // e — archive
  onEscape: () => void;      // Esc — deselect
  enabled?: boolean;
}

export function useKeyboardNav({
  onNext,
  onPrev,
  onReply,
  onArchive,
  onEscape,
  enabled = true,
}: KeyboardNavOptions) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Skip if user is typing in an input / textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          onNext();
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          onPrev();
          break;
        case "r":
          e.preventDefault();
          onReply();
          break;
        case "e":
          e.preventDefault();
          onArchive();
          break;
        case "Escape":
          e.preventDefault();
          onEscape();
          break;
      }
    },
    [enabled, onNext, onPrev, onReply, onArchive, onEscape]
  );

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);
}
