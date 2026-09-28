import type { common as enCommon } from "../en/common";

// Hindi — professional business register ("आप" form), like a well-made Indian banking or analytics app.
// Keep "AI", "Google" and brand names in Latin script. Common business loanwords (स्कोर) are fine.
export const common: Record<keyof typeof enCommon, string> = {
  "app.name": "BrandVisibility",
  "app.tagline": "AI सर्च के लिए विज़िबिलिटी इंटेलिजेंस",
  "app.home": "BrandVisibility – होम",
  "app.skipToContent": "मुख्य सामग्री पर जाएँ",

  "nav.providers": "कनेक्शन",
  "nav.providersClose": "कनेक्शन बंद करें",
  "nav.scrollDown": "अगले सेक्शन पर जाएँ",
  "nav.scrollTop": "सबसे ऊपर जाएँ",

  "lang.label": "भाषा",
  "lang.button": "भाषा: {lang}। {next} पर बदलें",
  "lang.changed": "भाषा {lang} पर सेट की गई",

  "theme.light": "लाइट",
  "theme.dark": "डार्क",
  "theme.system": "सिस्टम",
  "theme.toLight": "लाइट थीम पर बदलें",
  "theme.toDark": "डार्क थीम पर बदलें",
  "theme.current": "थीम: {theme}",

  "details.label": "विस्तृत मेट्रिक्स दिखाएँ",
  "details.hint": "घटक स्कोर, कॉन्फ़िडेंस इंटरवल और विश्लेषण तालिकाएँ",
  "details.on": "विस्तृत मेट्रिक्स दिखाए जा रहे हैं",
  "details.off": "विस्तृत मेट्रिक्स छिपाए गए",
  "details.analyst": "एनालिस्ट व्यू",

  "footer.text": "वास्तविक ग्राहकों के प्रश्नों पर AI असिस्टेंट आपके ब्रांड की कितनी बार सिफ़ारिश करते हैं, इसका मापन।",

  "notFound.title": "पेज नहीं मिला",
  "notFound.body": "अनुरोधित पेज मौजूद नहीं है या स्थानांतरित कर दिया गया है।",
  "notFound.back": "ओवरव्यू पर लौटें",

  "loading": "लोड हो रहा है…",
  "error": "कोई त्रुटि हुई",
  "error.network": "सर्वर से संपर्क नहीं हो सका। सुनिश्चित करें कि सर्वर चालू है और पुनः प्रयास करें।",
  "retry": "पुनः प्रयास करें",
  "back": "वापस",
  "save": "सेव करें",
  "saving": "सेव हो रहा है…",
  "cancel": "रद्द करें",
  "close": "बंद करें",
  "delete": "हटाएँ",
  "edit": "संपादित करें",
  "add": "जोड़ें",
  "yes": "हाँ",
  "no": "नहीं",
  "next": "आगे",
  "done": "पूर्ण",
  "on": "चालू",
  "off": "बंद",
  "optional": "वैकल्पिक",
  "required": "आवश्यक",
  "showMore": "और दिखाएँ",
  "showLess": "कम दिखाएँ",
  "seeAll": "सभी देखें",
  "learnMore": "अधिक जानें",
  "unknown": "अज्ञात",
  "none": "कोई नहीं",

  "count.questions_one": "{n} प्रश्न",
  "count.questions_other": "{n} प्रश्न",
  "count.answers_one": "{n} जवाब",
  "count.answers_other": "{n} जवाब",
  "count.ais_one": "{n} AI",
  "count.ais_other": "{n} AI",
  "count.brands_one": "{n} ब्रांड",
  "count.brands_other": "{n} ब्रांड",
  // English placeholders — translation pending.
  "nav.app": "Open the BrandVisibility app",
};
