import { useId } from "react";

/**
 * Small "i" marker; hovering or focusing it shows `text` in a tooltip. Inside a link (brand cards)
 * pass `plain`: no nested button, and the browser's own title tooltip (the card clips overflow).
 */
export function InfoTip({ text, label, plain = false }: { text: string; label: string; plain?: boolean }) {
  const id = useId();
  if (plain) {
    return (
      <span className="info-tip">
        <span className="info-tip-btn" title={text} aria-hidden="true">
          i
        </span>
      </span>
    );
  }
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
