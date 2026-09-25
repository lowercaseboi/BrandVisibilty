import type { common as enCommon } from "../en/common";

// Hindi — spoken register for shop owners. Keep "AI", "Google" and brand names in Latin script.
export const common: Record<keyof typeof enCommon, string> = {
  "app.name": "AI Visibility",
  "app.tagline": "देखिए, AI असिस्टेंट आपकी दुकान का नाम सुझाते हैं या नहीं",
  "app.home": "AI Visibility – मुख्य पेज",
  "app.skipToContent": "सीधे मुख्य हिस्से पर जाएँ",

  "nav.label": "मुख्य मेनू",
  "nav.shops": "आपकी दुकानें",
  "nav.providers": "जुड़े हुए AI",

  "search.button": "खोजें",
  "search.label": "दुकानें और पेज खोजें (Ctrl K)",

  "lang.label": "भाषा",
  "lang.button": "भाषा बदलें (अभी: {lang})",

  "theme.light": "लाइट",
  "theme.dark": "डार्क",
  "theme.system": "डिवाइस जैसा",
  "theme.toLight": "लाइट थीम चालू करें",
  "theme.toDark": "डार्क थीम चालू करें",
  "theme.current": "थीम: {theme}",

  "details.label": "इसके पीछे के आँकड़े दिखाएँ",
  "details.short": "आँकड़े",
  "details.hint": "स्कोर, भरोसे की रेंज और पूरी टेबल दिखाता है",

  "footer.text": "जब लोग AI असिस्टेंट से सुझाव माँगते हैं, तो वे आपकी दुकान का नाम कितनी बार लेते हैं — हम यही जाँचते हैं।",

  "notFound.title": "यह पेज नहीं मिला",
  "notFound.body": "यह पेज मौजूद नहीं है या कहीं और चला गया है।",
  "notFound.back": "अपनी दुकानों पर वापस जाएँ",

  "loading": "लोड हो रहा है…",
  "error": "कुछ गड़बड़ हो गई",
  "error.network": "सर्वर से जुड़ नहीं पाए। देखें कि सर्वर चालू है, फिर दोबारा कोशिश करें।",
  "retry": "फिर से कोशिश करें",
  "back": "वापस",
  "save": "सेव करें",
  "saving": "सेव हो रहा है…",
  "cancel": "रद्द करें",
  "close": "बंद करें",
  "delete": "हटाएँ",
  "edit": "बदलें",
  "add": "जोड़ें",
  "yes": "हाँ",
  "no": "नहीं",
  "next": "आगे",
  "done": "हो गया",
  "on": "चालू",
  "off": "बंद",
  "optional": "ज़रूरी नहीं",
  "required": "ज़रूरी है",
  "showMore": "और दिखाएँ",
  "showLess": "कम दिखाएँ",
  "seeAll": "सब देखें",
  "learnMore": "और जानें",
  "unknown": "पता नहीं",
  "none": "कोई नहीं",

  "count.questions_one": "{n} सवाल",
  "count.questions_other": "{n} सवाल",
  "count.answers_one": "{n} जवाब",
  "count.answers_other": "{n} जवाब",
  "count.ais_one": "{n} AI",
  "count.ais_other": "{n} AI",
  "count.shops_one": "{n} दुकान",
  "count.shops_other": "{n} दुकानें",
};
