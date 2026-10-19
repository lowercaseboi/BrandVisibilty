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
  "theme.toLight": "लाइट थीम पर बदलें",
  "theme.toDark": "डार्क थीम पर बदलें",
  "theme.current": "थीम: {theme}",

  "details.label": "विश्लेषणात्मक व्यू",
  "details.hint": "हर नतीजे के पीछे के स्कोर, रेंज और तालिकाएँ दिखाएँ",
  "details.on": "विश्लेषणात्मक व्यू चालू",
  "details.off": "विश्लेषणात्मक व्यू बंद",
  "details.analyst": "विश्लेषणात्मक व्यू",

  "footer.text": "वास्तविक ग्राहकों के प्रश्नों पर AI असिस्टेंट आपके ब्रांड की कितनी बार सिफ़ारिश करते हैं, इसका मापन।",

  "notFound.title": "पेज नहीं मिला",
  "notFound.body": "अनुरोधित पेज मौजूद नहीं है या स्थानांतरित कर दिया गया है।",
  "notFound.back": "ओवरव्यू पर लौटें",

  "errorBoundary.title": "कोई त्रुटि हुई",
  "errorBoundary.body": "इस पेज में एक अनपेक्षित त्रुटि आई। पेज रीलोड करने से आमतौर पर यह ठीक हो जाती है।",
  "errorBoundary.reload": "पेज रीलोड करें",
  "errorBoundary.goToDashboard": "ओवरव्यू पर जाएँ",

  "loading": "लोड हो रहा है…",
  "error.network": "सर्वर से संपर्क नहीं हो सका। सुनिश्चित करें कि सर्वर चालू है और पुनः प्रयास करें।",
  "retry": "पुनः प्रयास करें",
  "save": "सेव करें",
  "saving": "सेव हो रहा है…",
  "cancel": "रद्द करें",
  "delete": "हटाएँ",
  "add": "जोड़ें",
  "on": "चालू",
  "off": "बंद",
  "showMore": "और दिखाएँ",
  "showLess": "कम दिखाएँ",
  "serverWaking": "सर्वर को सक्रिय किया जा रहा है। फ्री होस्टिंग पर पहली बार लोड में लगभग 30 सेकंड लग सकते हैं।",
  "none": "कोई नहीं",

  // English placeholders — translation pending.
  "nav.app": "Open the BrandVisibility app",
};
