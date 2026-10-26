import type { modules as enModules } from "../en/modules";

// Hindi strings for the modules namespace (Analysis and Gaps & evidence modules) — professional
// business register ("आप" form). See src/i18n/GLOSSARY.hi.md. Keep {placeholders} and **bold** exactly.
export const modules: Record<keyof typeof enModules, string> = {
  // ---- Analysis
  "analysis.empty.body2": "इसमें कुछ मिनट लगते हैं — इसे रन पैनल से शुरू करें।",
  "analysis.trend.eyebrow": "समय के साथ",
  "analysis.deeper.title": "विस्तृत आँकड़े",
  "analysis.deeper.summary": "रन की जानकारी, स्कोर, तुलनीयता, हर AI और प्रतिस्पर्धी",
  "analysis.deeper.facts": "यह विश्लेषण",

  // ---- Gaps & evidence: left pane
  "gaps.eyebrow": "तय नियमों से पहचाने गए",
  "gaps.select": "चुनें",
  "gaps.none.body": "गैप, और उनके पीछे के AI जवाब, पहले विश्लेषण के बाद दिखेंगे।",
  "gaps.none.cta": "विश्लेषण पर जाएँ",

  // ---- Gaps & evidence: right pane
  "evidence.forGap_one": "इस गैप के पीछे का **{n}** जवाब दिखाया जा रहा है।",
  "evidence.forGap_other": "इस गैप के पीछे के **{n}** जवाब दिखाए जा रहे हैं।",
  "evidence.forRefs_one": "इस सिफ़ारिश के पीछे का **{n}** जवाब दिखाया जा रहा है।",
  "evidence.forRefs_other": "इस सिफ़ारिश के पीछे के **{n}** जवाब दिखाए जा रहे हैं।",
  "evidence.found": "इनमें से {found} इस विश्लेषण के AI जवाब हैं।",
  "evidence.noneLinked": "इस विश्लेषण का कोई AI जवाब यहाँ जुड़ा नहीं है — यह प्रमाण दूसरे स्रोतों की ओर संकेत करता है।",
  "evidence.clear": "हटाएँ",
  "evidence.clearAria": "चयन हटाएँ और सभी जवाब दिखाएँ",
  "evidence.hint": "नीचे केवल उसी गैप के पीछे के जवाब देखने के लिए कोई गैप चुनें।",
  "evidence.all": "सभी जवाब",
  "evidence.showMore_one": "{n} और दिखाएँ",
  "evidence.showMore_other": "{n} और दिखाएँ",
  "evidence.resetFilters": "फ़िल्टर हटाएँ",
  "evidence.gapMissing": "यह गैप इस विश्लेषण का हिस्सा नहीं है — संभव है कि यह बाद में हल हो गया हो। इसके बजाय सभी जवाब दिखाए जा रहे हैं।",
  "evidence.olderRun": "आप {when} का एक पुराना विश्लेषण देख रहे हैं। उसी के गैप और जवाब दिखाए गए हैं।",
  "evidence.olderRunUnknown": "आप ऐसा विश्लेषण देख रहे हैं जो सबसे नया नहीं है।",
  "evidence.toLatest": "सबसे नया देखें",
};
