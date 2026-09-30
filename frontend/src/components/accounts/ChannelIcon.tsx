import type { ChannelId } from "../../api/types";

/** Generic line icons per platform (deliberately not the platforms' logos), same style as ModuleIcon. */
export function ChannelIcon({ channel, size = 22 }: { channel: ChannelId; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (channel) {
    case "facebook_page": // a page with a header block and text lines
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
          <rect x="7" y="6.5" width="10" height="4" rx="0.6" />
          <path d="M7 14h10M7 17h6" />
        </svg>
      );
    case "instagram": // a camera
      return (
        <svg {...common}>
          <rect x="3.5" y="6" width="17" height="13" rx="2.5" />
          <path d="M8.5 6l1.2-2h4.6l1.2 2" />
          <circle cx="12" cy="12.5" r="3.4" />
        </svg>
      );
    case "x": // a short post with a character counter
      return (
        <svg {...common}>
          <path d="M4 5.5h16v10H10l-4 3.5v-3.5H4z" />
          <path d="M7.5 9h9M7.5 12h5.5" />
        </svg>
      );
    case "linkedin": // a briefcase
      return (
        <svg {...common}>
          <rect x="3.5" y="7.5" width="17" height="12" rx="1.5" />
          <path d="M9 7.5V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          <path d="M3.5 12.5h17" />
        </svg>
      );
    case "google_business": // a shopfront with an awning
      return (
        <svg {...common}>
          <path d="M4 9l1.5-4.5h13L20 9" />
          <path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9" />
          <path d="M5.5 11.5v8h13v-8" />
          <path d="M10 19.5v-4.5h4v4.5" />
        </svg>
      );
    case "whatsapp": // a round chat bubble
      return (
        <svg {...common}>
          <path d="M5.2 18.8l1-3.3A7.5 7.5 0 1 1 9 18.1z" />
          <path d="M9.5 10.5c.3 1.6 1.9 3.2 3.5 3.5" />
        </svg>
      );
    default: // share arrow
      return (
        <svg {...common}>
          <path d="M12 4v11M8 8l4-4 4 4" />
          <path d="M5 13v6h14v-6" />
        </svg>
      );
  }
}
