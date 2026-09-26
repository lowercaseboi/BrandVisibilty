import { useId } from "react";

/** Small "i" marker; hovering or focusing it shows `text` in a tooltip. */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const id = useId();
  return (
    <span className="info-tip">
      <button type="button" className="info-tip-btn" aria-label={label} aria-describedby={id}>
        i
      </button>
      <span role="tooltip" id={id} className="info-tip-text">
        {text}
      </span>
    </span>
  );
}
