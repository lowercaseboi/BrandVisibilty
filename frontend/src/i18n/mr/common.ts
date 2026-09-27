import type { common as enCommon } from "../en/common";

// Marathi — professional written register (प्रमाण मराठी, "तुम्ही" form, -े endings). Keep "AI", "Google" and
// brand names in Latin script. Terms follow src/i18n/GLOSSARY.mr.md.
export const common: Record<keyof typeof enCommon, string> = {
  "app.name": "BrandVisibility",
  "app.tagline": "AI सर्चसाठी दृश्यता विश्लेषण",
  "app.home": "BrandVisibility – मुख्य पान",
  "app.skipToContent": "मुख्य मजकुराकडे जा",

  "nav.providers": "कनेक्शन",
  "nav.providersClose": "कनेक्शन बंद करा",

  "lang.label": "भाषा",
  "lang.button": "भाषा: {lang}. {next} वर बदला",
  "lang.changed": "भाषा {lang} वर सेट केली",

  "theme.light": "लाइट",
  "theme.dark": "डार्क",
  "theme.system": "सिस्टम",
  "theme.toLight": "लाइट थीमवर बदला",
  "theme.toDark": "डार्क थीमवर बदला",
  "theme.current": "थीम: {theme}",

  "details.label": "सविस्तर मेट्रिक्स दाखवा",
  "details.hint": "घटक स्कोर, कॉन्फिडन्स इंटरव्हल आणि विश्लेषण तक्ते",
  "details.on": "सविस्तर मेट्रिक्स दाखवले आहेत",
  "details.off": "सविस्तर मेट्रिक्स लपवले आहेत",
  "details.analyst": "अ‍ॅनालिस्ट व्यू",

  "footer.text": "प्रत्यक्ष ग्राहकांच्या प्रश्नांवर AI असिस्टंट तुमच्या ब्रँडची किती वेळा शिफारस करतात, याचे मोजमाप.",

  "notFound.title": "पान सापडले नाही",
  "notFound.body": "विनंती केलेले पान अस्तित्वात नाही किंवा हलवले गेले आहे.",
  "notFound.back": "ओव्हरव्ह्यूकडे परत जा",

  "loading": "लोड होत आहे…",
  "error": "त्रुटी आली",
  "error.network": "सर्व्हरशी संपर्क होऊ शकला नाही. सर्व्हर सुरू असल्याची खात्री करून पुन्हा प्रयत्न करा.",
  "retry": "पुन्हा प्रयत्न करा",
  "back": "मागे",
  "save": "सेव्ह करा",
  "saving": "सेव्ह होत आहे…",
  "cancel": "रद्द करा",
  "close": "बंद करा",
  "delete": "हटवा",
  "edit": "संपादित करा",
  "add": "जोडा",
  "yes": "होय",
  "no": "नाही",
  "next": "पुढे",
  "done": "पूर्ण",
  "on": "सुरू",
  "off": "बंद",
  "optional": "ऐच्छिक",
  "required": "आवश्यक",
  "showMore": "अधिक दाखवा",
  "showLess": "कमी दाखवा",
  "seeAll": "सर्व पाहा",
  "learnMore": "अधिक जाणून घ्या",
  "unknown": "अज्ञात",
  "none": "काहीही नाही",

  "count.questions_one": "{n} प्रश्न",
  "count.questions_other": "{n} प्रश्न",
  "count.answers_one": "{n} प्रतिसाद",
  "count.answers_other": "{n} प्रतिसाद",
  "count.ais_one": "{n} AI",
  "count.ais_other": "{n} AI",
  "count.brands_one": "{n} ब्रँड",
  "count.brands_other": "{n} ब्रँड",
  // English placeholders — translation pending.
  "nav.app": "Open the BrandVisibility app",
};
