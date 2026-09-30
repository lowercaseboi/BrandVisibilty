import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { mediaUrl } from "../../api/client";
import type { Asset, ImageFormat, Variant } from "../../api/types";
import { useT } from "../../i18n";
import { composePost, latestAssetByFormat } from "./campaignModel";

// Lightweight look-alike mockups of each app, drawn from tokens (they follow the dark/light theme)
// with our own generic line icons — no platform logos. Text is rendered as plain React text:
// hashtags and links are only coloured, never turned into HTML.

const RICH_RE = /(#[\p{L}\p{N}_]+|https?:\/\/[^\s]+|www\.[^\s]+)/gu;

/** Post text with hashtags and links tinted like the app does. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(RICH_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="pv-tag">
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function Icon({ d, size = 18 }: { d: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d}
    </svg>
  );
}

const ICONS = {
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  comment: <path d="M4 5h16v11H9l-5 4z" />,
  share: (
    <>
      <path d="M4 12v7h16v-7" />
      <path d="M12 4v11" />
      <path d="M8 8l4-4 4 4" />
    </>
  ),
  send: <path d="M21 4L10 14M21 4l-7 17-4-7-7-4z" />,
  bookmark: <path d="M6 4h12v17l-6-4-6 4z" />,
  repost: (
    <>
      <path d="M7 7h11v6" />
      <path d="M15 4l3 3-3 3" />
      <path d="M17 17H6v-6" />
      <path d="M9 20l-3-3 3-3" />
    </>
  ),
  views: <path d="M5 20V12M10 20V7M15 20v-5M20 20V9" />,
  like: <path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2 3l-1 3h6c1 0 2 1 1.7 2.2l-1.5 6.3c-.2.9-1 1.5-2 1.5H7" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="0.8" />
      <circle cx="12" cy="12" r="0.8" />
      <circle cx="18" cy="12" r="0.8" />
    </>
  ),
  ticks: <path d="M2 13l4 4 8-9M10 17l1 0 8-9" />,
  pin: (
    <>
      <path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" />
      <circle cx="12" cy="10" r="2" />
    </>
  ),
};

function Avatar({ name, round = true }: { name: string; round?: boolean }) {
  return (
    <span className={`pv-avatar${round ? "" : " is-square"}`} aria-hidden="true">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function Picture({ asset, ratio, alt }: { asset: Asset | null; ratio: string; alt: string }) {
  const t = useT();
  return (
    <div className="pv-media" style={{ aspectRatio: ratio }}>
      {asset ? (
        <img src={mediaUrl(asset.path, asset.created_at)} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <span className="pv-media-empty">{t("board.campaign.preview.noImage")}</span>
      )}
    </div>
  );
}

export interface PreviewProps {
  variant: Variant;
  asset: Asset | null;
  assets: Asset[];
  brandName: string;
  handle: string;
  /** Instagram only: switch the posted image between square and portrait. */
  onPickAsset?: (assetId: string) => void;
}

function Truncated({ text, lines }: { text: string; lines: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const long = text.split("\n").length > lines || text.length > lines * 60;
  return (
    <div className="pv-text">
      <p className={open || !long ? "" : "pv-clamp"} style={{ WebkitLineClamp: lines }}>
        <RichText text={text} />
      </p>
      {long && (
        <button type="button" className="pv-more" onClick={() => setOpen((o) => !o)}>
          {open ? t("board.campaign.preview.less") : t("board.campaign.preview.more")}
        </button>
      )}
    </div>
  );
}

function FacebookPreview({ variant, asset, brandName }: PreviewProps) {
  const t = useT();
  return (
    <article className="pv pv-fb">
      <header className="pv-head">
        <Avatar name={brandName} />
        <div className="pv-who">
          <strong>{brandName}</strong>
          <span className="pv-sub">
            {t("board.campaign.preview.justNow")} · <Icon d={ICONS.globe} size={12} />
          </span>
        </div>
        <span className="pv-icon-muted">
          <Icon d={ICONS.more} />
        </span>
      </header>
      <Truncated text={composePost(variant)} lines={5} />
      <Picture asset={asset} ratio={asset?.format === "landscape" ? "1200 / 675" : "1 / 1"} alt={variant.alt_text ?? ""} />
      <footer className="pv-actions pv-actions-spread">
        <span>
          <Icon d={ICONS.like} /> {t("board.campaign.preview.fbLike")}
        </span>
        <span>
          <Icon d={ICONS.comment} /> {t("board.campaign.preview.fbComment")}
        </span>
        <span>
          <Icon d={ICONS.share} /> {t("board.campaign.preview.fbShare")}
        </span>
      </footer>
    </article>
  );
}

function InstagramPreview({ variant, asset, assets, brandName, handle, onPickAsset }: PreviewProps) {
  const t = useT();
  const byFormat = latestAssetByFormat(assets);
  const format: ImageFormat = asset?.format === "portrait" ? "portrait" : "square";
  const caption = composePost(variant);
  return (
    <div className="pv-stack">
      <div className="segmented pv-toggle" role="group" aria-label={t("board.campaign.preview.igFormat")}>
        {(["square", "portrait"] as const).map((f) => {
          const a = byFormat.get(f);
          return (
            <button
              key={f}
              type="button"
              aria-pressed={format === f}
              className={format === f ? "is-active" : ""}
              disabled={!a || !onPickAsset}
              onClick={() => a && onPickAsset?.(a.asset_id)}
            >
              {f === "square" ? t("board.campaign.format.square") : t("board.campaign.format.portrait")}
            </button>
          );
        })}
      </div>
      <article className="pv pv-ig">
        <header className="pv-head">
          <Avatar name={brandName} />
          <div className="pv-who">
            <strong>{handle}</strong>
          </div>
          <span className="pv-icon-muted">
            <Icon d={ICONS.more} />
          </span>
        </header>
        <Picture asset={asset} ratio={format === "portrait" ? "4 / 5" : "1 / 1"} alt={variant.alt_text ?? ""} />
        <footer className="pv-actions">
          <Icon d={ICONS.heart} size={22} />
          <Icon d={ICONS.comment} size={22} />
          <Icon d={ICONS.send} size={22} />
          <span className="pv-grow" />
          <Icon d={ICONS.bookmark} size={22} />
        </footer>
        <div className="pv-caption">
          <strong>{handle}</strong> <Truncated text={caption} lines={2} />
        </div>
        {variant.link && <p className="pv-note">{t("board.campaign.preview.igLink")}</p>}
      </article>
    </div>
  );
}

function XPreview({ variant, asset, brandName, handle }: PreviewProps) {
  const t = useT();
  return (
    <article className="pv pv-x">
      <div className="pv-x-row">
        <Avatar name={brandName} />
        <div className="pv-x-body">
          <header className="pv-x-head">
            <strong>{brandName}</strong> <span className="pv-sub">@{handle} · {t("board.campaign.preview.now")}</span>
          </header>
          <div className="pv-text">
            <p>
              <RichText text={composePost(variant)} />
            </p>
          </div>
          {asset && <Picture asset={asset} ratio="1200 / 675" alt={variant.alt_text ?? ""} />}
          <footer className="pv-actions pv-actions-spread pv-x-actions">
            <Icon d={ICONS.comment} size={16} />
            <Icon d={ICONS.repost} size={16} />
            <Icon d={ICONS.heart} size={16} />
            <Icon d={ICONS.views} size={16} />
            <Icon d={ICONS.share} size={16} />
          </footer>
        </div>
      </div>
    </article>
  );
}

function LinkedInPreview({ variant, asset, brandName }: PreviewProps) {
  const t = useT();
  return (
    <article className="pv pv-li">
      <header className="pv-head">
        <Avatar name={brandName} round={false} />
        <div className="pv-who">
          <strong>{brandName}</strong>
          <span className="pv-sub">{t("board.campaign.preview.liPage")}</span>
          <span className="pv-sub">
            {t("board.campaign.preview.now")} · <Icon d={ICONS.globe} size={12} />
          </span>
        </div>
        <span className="pv-icon-muted">
          <Icon d={ICONS.more} />
        </span>
      </header>
      <Truncated text={composePost(variant)} lines={3} />
      {asset && <Picture asset={asset} ratio={asset.format === "landscape" ? "1200 / 627" : "1 / 1"} alt={variant.alt_text ?? ""} />}
      <footer className="pv-actions pv-actions-spread">
        <span>
          <Icon d={ICONS.like} /> {t("board.campaign.preview.fbLike")}
        </span>
        <span>
          <Icon d={ICONS.comment} /> {t("board.campaign.preview.fbComment")}
        </span>
        <span>
          <Icon d={ICONS.repost} /> {t("board.campaign.preview.liRepost")}
        </span>
        <span>
          <Icon d={ICONS.send} /> {t("board.campaign.preview.liSend")}
        </span>
      </footer>
    </article>
  );
}

function WhatsAppPreview({ variant, asset, assets, brandName }: PreviewProps) {
  const t = useT();
  const story = latestAssetByFormat(assets).get("story") ?? null;
  return (
    <div className="pv-wa-wrap">
      <article className="pv pv-wa">
        <header className="pv-wa-head">
          <Avatar name={brandName} />
          <strong>{brandName}</strong>
        </header>
        <div className="pv-wa-chat">
          <div className="pv-wa-bubble">
            {asset && <Picture asset={asset} ratio="1 / 1" alt={variant.alt_text ?? ""} />}
            <p>
              <RichText text={composePost(variant)} />
            </p>
            <span className="pv-wa-meta">
              {t("board.campaign.preview.waTime")} <Icon d={ICONS.ticks} size={14} />
            </span>
          </div>
        </div>
      </article>
      {story && (
        <figure className="pv-wa-status">
          <Picture asset={story} ratio="9 / 16" alt={variant.alt_text ?? ""} />
          <figcaption>{t("board.campaign.preview.waStatus")}</figcaption>
        </figure>
      )}
    </div>
  );
}

function GbpPreview({ variant, asset, brandName }: PreviewProps) {
  const t = useT();
  return (
    <article className="pv pv-gbp">
      <header className="pv-head">
        <Avatar name={brandName} round={false} />
        <div className="pv-who">
          <strong>{brandName}</strong>
          <span className="pv-sub">
            <Icon d={ICONS.pin} size={12} /> {t("board.campaign.preview.gbpUpdate")}
          </span>
        </div>
      </header>
      <Picture asset={asset} ratio="4 / 3" alt={variant.alt_text ?? ""} />
      <Truncated text={composePost(variant)} lines={4} />
      {variant.link && (
        <footer className="pv-gbp-cta">
          <span>{t("board.campaign.preview.gbpCta")}</span>
        </footer>
      )}
    </article>
  );
}

function SandboxPreview({ variant, asset, brandName }: PreviewProps) {
  const t = useT();
  return (
    <article className="pv pv-sandbox">
      <p className="pv-sandbox-tag">
        {variant.channel === "export" ? t("board.campaign.preview.export") : t("board.campaign.preview.sandbox")}
      </p>
      <header className="pv-head">
        <Avatar name={brandName} />
        <div className="pv-who">
          <strong>{brandName}</strong>
        </div>
      </header>
      <div className="pv-text">
        <p>
          <RichText text={composePost(variant)} />
        </p>
      </div>
      {asset && <Picture asset={asset} ratio="1 / 1" alt={variant.alt_text ?? ""} />}
    </article>
  );
}

/** The app mockup for one channel's variant. */
export function PlatformPreview(props: PreviewProps) {
  switch (props.variant.channel) {
    case "facebook_page":
      return <FacebookPreview {...props} />;
    case "instagram":
      return <InstagramPreview {...props} />;
    case "x":
      return <XPreview {...props} />;
    case "linkedin":
      return <LinkedInPreview {...props} />;
    case "whatsapp":
      return <WhatsAppPreview {...props} />;
    case "google_business":
      return <GbpPreview {...props} />;
    default:
      return <SandboxPreview {...props} />;
  }
}
