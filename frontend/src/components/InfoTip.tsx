import { useId } from "react";

/**
 * Small "i" marker; hovering or focusing it shows `text` in a tooltip. With `interactive={false}`
 * (inside a link, where a nested button is invalid) the marker is a plain span: hover still shows
 * the tooltip, and the text stays in the link's content for screen readers.
 */
export function InfoTip({ text, label, interactive = true }: { text: string; label: string; interactive?: boolean }) {
  const id = useId();
  if (!interactive) {
    return (
      <span className="info-tip">
        <span className="info-tip-btn" aria-hidden="true">
          i
        </span>
        <span className="info-tip-text">{text}</span>
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
