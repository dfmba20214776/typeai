"use client";

import { useEngineStore } from "../state";

export default function GhostOverlay() {
  const { ghostText, ghostLeadText } = useEngineStore();
  if (!ghostText) return null;
  return (
    <div className="ghost" aria-hidden>
      <span className="ghost-prefix">{ghostLeadText}</span>
      <span>{ghostText}</span>
    </div>
  );
}
