import type { common as enCommon } from "../en/common";

// Marathi — spoken register for brand owners ("तुम्ही" form). Keep "AI", "Google" and brand names in Latin script.
// Terms follow src/i18n/GLOSSARY.mr.md.
export const common: Record<keyof typeof enCommon, string> = {
  "app.name": "AI Visibility",
  "app.tagline": "AI असिस्टंट तुमचा ब्रँड सुचवतात का, ते पाहा",
  "app.home": "AI Visibility – मुख्य पान",
  "app.skipToContent": "थेट मुख्य भागावर जा",

  "nav.label": "मुख्य मेनू",
  "nav.brands": "ब्रँड",
  "nav.providers": "कनेक्शन",

  "search.button": "शोधा",
  "search.label": "ब्रँड आणि पाने शोधा (Ctrl K)",

  "lang.label": "भाषा",
  "lang.button": "भाषा बदला (सध्या: {lang})",

  "theme.light": "लाइट",
  "theme.dark": "डार्क",
  "theme.system": "डिव्हाइसप्रमाणे",
  "theme.toLight": "लाइट थीम लावा",
  "theme.toDark": "डार्क थीम लावा",
  "theme.current": "थीम: {theme}",

  "details.label": "यामागचे आकडे दाखवा",
  "details.hint": "स्कोर, अंदाजे रेंज आणि सविस्तर तक्ते",

  "footer.text": "लोक AI असिस्टंटला सल्ला विचारतात तेव्हा ते तुमच्या ब्रँडचं नाव किती वेळा घेतात, हे आम्ही तपासतो.",

  "notFound.title": "हे पान सापडलं नाही",
  "notFound.body": "हे पान अस्तित्वात नाही किंवा दुसरीकडे हलवलं आहे.",
  "notFound.back": "सर्व ब्रँडकडे परत जा",

  "loading": "लोड होत आहे…",
  "error": "काहीतरी चुकलं",
  "error.network": "सर्व्हरशी जोडता आलं नाही. सर्व्हर चालू आहे का ते पाहा आणि पुन्हा प्रयत्न करा.",
  "retry": "पुन्हा प्रयत्न करा",
  "back": "मागे",
  "save": "सेव्ह करा",
  "saving": "सेव्ह होत आहे…",
  "cancel": "रद्द करा",
  "close": "बंद करा",
  "delete": "काढून टाका",
  "edit": "बदला",
  "add": "जोडा",
  "yes": "हो",
  "no": "नाही",
  "next": "पुढे",
  "done": "झालं",
  "on": "चालू",
  "off": "बंद",
  "optional": "ऐच्छिक",
  "required": "आवश्यक",
  "showMore": "अजून दाखवा",
  "showLess": "कमी दाखवा",
  "seeAll": "सगळे पाहा",
  "learnMore": "अधिक माहिती",
  "unknown": "माहीत नाही",
  "none": "काही नाही",

  "count.questions_one": "{n} प्रश्न",
  "count.questions_other": "{n} प्रश्न",
  "count.answers_one": "{n} उत्तर",
  "count.answers_other": "{n} उत्तरे",
  "count.ais_one": "{n} AI",
  "count.ais_other": "{n} AI",
  "count.brands_one": "{n} ब्रँड",
  "count.brands_other": "{n} ब्रँड",
};
