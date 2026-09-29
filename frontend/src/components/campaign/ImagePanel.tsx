import { useId, useState } from "react";
import { mediaUrl } from "../../api/client";
import { IMAGE_SIZES } from "../../api/types";
import type { Asset, ImageFormat, RegenerateImageRequest } from "../../api/types";
import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { FORMAT_LABEL } from "./campaignModel";

const FORMATS: ImageFormat[] = ["square", "portrait", "landscape", "story", "gbp"];

/** Style chips: the value sent as `style` to regenerate-image. */
const STYLES: { id: string; key: MessageKey }[] = [
  { id: "warm", key: "board.campaign.image.style.warm" },
  { id: "minimal", key: "board.campaign.image.style.minimal" },
  { id: "festive", key: "board.campaign.image.style.festive" },
  { id: "photo", key: "board.campaign.image.style.photo" },
];

const randomSeed = () => Math.floor(Math.random() * 1_000_000);

export interface ImagePanelProps {
  assets: Asset[];
  /** The asset the active channel posts (highlighted; "Use here" targets that channel). */
  activeAssetId: string | null;
  activeChannelName: string;
  defaultFormat: ImageFormat;
  busy: boolean;
  disabled: boolean;
  onRegenerate: (req: RegenerateImageRequest) => void;
  onUse: (assetId: string) => void;
}

/**
 * The campaign's images, newest first per format, and a regenerate form: format, an optional prompt
 * tweak, a style chip and a seed (shuffle for a new take). The overlay text is drawn by our own
 * compositor, never by the image model, so it stays readable (DESIGN: imagegen/compositor.py).
 */
export function ImagePanel({ assets, activeAssetId, activeChannelName, defaultFormat, busy, disabled, onRegenerate, onUse }: ImagePanelProps) {
  const t = useT();
  const [format, setFormat] = useState<ImageFormat>(defaultFormat);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const headingId = useId();
  const promptId = useId();

  const sorted = [...assets].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const basePrompt = sorted.find((a) => a.format === format)?.prompt ?? sorted[0]?.prompt ?? "";

  const submit = () => {
    const req: RegenerateImageRequest = { format };
    if (prompt.trim()) req.prompt = prompt.trim();
    if (style) req.style = style;
    if (seed !== null) req.seed = seed;
    onRegenerate(req);
  };

  return (
    <section className="card cs-panel cs-images" aria-labelledby={headingId}>
      <div className="cs-panel-head">
        <h2 id={headingId}>{t("board.campaign.image.title")}</h2>
        <p className="muted small">{t("board.campaign.image.intro")}</p>
      </div>

      {sorted.length > 0 ? (
        <ul className="cs-thumbs">
          {sorted.map((a) => {
            const active = a.asset_id === activeAssetId;
            return (
              <li key={a.asset_id} className={`cs-thumb${active ? " is-active" : ""}`}>
                <div className="cs-thumb-img" style={{ aspectRatio: `${IMAGE_SIZES[a.format][0]} / ${IMAGE_SIZES[a.format][1]}` }}>
                  <img src={mediaUrl(a.path, a.created_at)} alt={a.overlay_text ?? ""} loading="lazy" decoding="async" />
                </div>
                <div className="cs-thumb-meta">
                  <strong>{t(FORMAT_LABEL[a.format])}</strong>
                  <span className="muted">
                    {IMAGE_SIZES[a.format].join("×")} · {a.provider === "template" ? t("board.campaign.image.template") : a.provider}
                    {a.seed != null ? ` · #${a.seed}` : ""}
                  </span>
                  {active ? (
                    <span className="cs-thumb-used">{t("board.campaign.image.used", { channel: activeChannelName })}</span>
                  ) : (
                    <button type="button" className="btn-link" disabled={disabled} onClick={() => onUse(a.asset_id)}>
                      {t("board.campaign.image.use", { channel: activeChannelName })}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">{t("board.campaign.image.none")}</p>
      )}

      <fieldset className="cs-regen" disabled={disabled || busy}>
        <legend className="eyebrow">{t("board.campaign.image.regenerate")}</legend>
        <div className="cs-row">
          <label className="field">
            {t("board.campaign.image.format")}
            <select value={format} onChange={(e) => setFormat(e.target.value as ImageFormat)}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {t(FORMAT_LABEL[f])} · {IMAGE_SIZES[f].join("×")}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>{t("board.campaign.image.seed")}</span>
            <span className="cs-seed">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                aria-label={t("board.campaign.image.seed")}
                placeholder={t("board.campaign.image.seedAuto")}
                value={seed ?? ""}
                onChange={(e) => setSeed(e.target.value === "" ? null : Math.max(0, Math.trunc(Number(e.target.value))))}
              />
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setSeed(randomSeed())}>
                {t("board.campaign.image.shuffle")}
              </button>
            </span>
          </div>
        </div>
        <div className="field">
          <label htmlFor={promptId}>{t("board.campaign.image.prompt")}</label>
          <textarea
            id={promptId}
            rows={2}
            value={prompt}
            placeholder={basePrompt || t("board.campaign.image.promptPlaceholder")}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <div className="cs-styles" role="group" aria-label={t("board.campaign.image.style")}>
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
        <div className="cs-regen-foot">
          <button type="button" className="btn btn-secondary" onClick={submit}>
            {busy && <span className="cs-spinner" aria-hidden="true" />}
            {busy ? t("board.campaign.image.working") : t("board.campaign.image.go", { format: t(FORMAT_LABEL[format]) })}
          </button>
        </div>
      </fieldset>
    </section>
  );
}
