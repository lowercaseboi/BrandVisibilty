import { useId, useState } from "react";
import { mediaUrl } from "../../api/client";
import { IMAGE_SIZES } from "../../api/types";
import type { Asset, ImageFormat, RegenerateImageRequest } from "../../api/types";
import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { FORMAT_LABEL } from "./campaignModel";

/** Style chips: the value sent as `style` to regenerate-image. */
const STYLES: { id: string; key: MessageKey }[] = [
  { id: "warm", key: "board.campaign.image.style.warm" },
  { id: "minimal", key: "board.campaign.image.style.minimal" },
  { id: "festive", key: "board.campaign.image.style.festive" },
  { id: "photo", key: "board.campaign.image.style.photo" },
];

export interface ImageStripProps {
  assets: Asset[];
  /** The image the active channel posts (marked "In use"). */
  activeAssetId: string | null;
  channelName: string;
  /** Shapes this channel posts, most natural first (the first is the default for a new image). */
  formats: ImageFormat[];
  busy: boolean;
  disabled: boolean;
  onRegenerate: (req: RegenerateImageRequest) => void;
  onUse: (assetId: string) => void;
}

/**
 * The campaign's images as a compact strip — pick one for this channel — and "New image": a shape,
 * a style chip and an optional prompt tweak. Every request gets a fresh seed, so it's a new take.
 * The overlay text is drawn by our compositor, never by the model (imagegen/compositor.py).
 */
export function ImageStrip({ assets, activeAssetId, channelName, formats, busy, disabled, onRegenerate, onUse }: ImageStripProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ImageFormat>(formats[0] ?? "square");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string | null>(null);
  const headingId = useId();
  const formId = useId();

  const sorted = [...assets].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const basePrompt = sorted.find((a) => a.format === format)?.prompt ?? sorted[0]?.prompt ?? "";

  const submit = () => {
    const req: RegenerateImageRequest = { format, seed: Math.floor(Math.random() * 1_000_000) };
    if (prompt.trim()) req.prompt = prompt.trim();
    if (style) req.style = style;
    onRegenerate(req);
  };

  return (
    <section className="cs-images" aria-labelledby={headingId}>
      <div className="field-head">
        <h3 id={headingId} className="cs-subhead">
          {t("board.campaign.image.title")}
        </h3>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          aria-expanded={open}
          aria-controls={formId}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
        >
          {busy && <span className="cs-spinner" aria-hidden="true" />}
          {busy ? t("board.campaign.image.working") : t("board.campaign.image.regenerate")}
        </button>
      </div>

      {sorted.length > 0 ? (
        <ul className="cs-strip">
          {sorted.map((a) => {
            const active = a.asset_id === activeAssetId;
            const label = `${t(FORMAT_LABEL[a.format])} · ${a.provider === "template" ? t("board.campaign.image.template") : a.provider}`;
            return (
              <li key={a.asset_id}>
                <button
                  type="button"
                  className={`cs-thumb${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  aria-label={`${t("board.campaign.image.use", { channel: channelName })}: ${label}`}
                  title={label}
                  disabled={disabled}
                  onClick={() => onUse(a.asset_id)}
                >
                  <img
                    src={mediaUrl(a.path, a.created_at)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ aspectRatio: `${IMAGE_SIZES[a.format][0]} / ${IMAGE_SIZES[a.format][1]}` }}
                  />
                  <span className="cs-thumb-label">{active ? t("board.campaign.image.inUse") : t(FORMAT_LABEL[a.format])}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">{t("board.campaign.image.none")}</p>
      )}

      {open && (
        <fieldset className="cs-regen field-group" id={formId} disabled={disabled || busy}>
          <legend className="sr-only">{t("board.campaign.image.regenerate")}</legend>
          <div className="field-pair">
            <label className="field">
              {t("board.campaign.image.format")}
              <select value={format} onChange={(e) => setFormat(e.target.value as ImageFormat)}>
                {formats.map((f) => (
                  <option key={f} value={f}>
                    {t(FORMAT_LABEL[f])} · {IMAGE_SIZES[f].join("×")}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t("board.campaign.image.prompt")}
              <input value={prompt} placeholder={basePrompt || t("board.campaign.image.promptPlaceholder")} onChange={(e) => setPrompt(e.target.value)} />
            </label>
          </div>
          <div className="chip-row" role="group" aria-label={t("board.campaign.image.style")}>
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`rec-filter${style === s.id ? " is-active" : ""}`}
                aria-pressed={style === s.id}
                onClick={() => setStyle((cur) => (cur === s.id ? null : s.id))}
              >
                {t(s.key)}
              </button>
            ))}
          </div>
          <p className="field-hint">{t("board.campaign.image.note")}</p>
          <div>
            <button type="button" className="btn btn-secondary btn-small" onClick={submit}>
              {busy && <span className="cs-spinner" aria-hidden="true" />}
              {busy ? t("board.campaign.image.working") : t("board.campaign.image.go", { format: t(FORMAT_LABEL[format]) })}
            </button>
          </div>
        </fieldset>
      )}
    </section>
  );
}
