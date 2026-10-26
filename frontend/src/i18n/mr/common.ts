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
  "nav.scrollDown": "पुढील विभागाकडे जा",
  "nav.scrollTop": "सर्वात वर जा",

  "lang.label": "भाषा",
  "lang.button": "भाषा: {lang}. {next} वर बदला",
  "lang.changed": "भाषा {lang} वर सेट केली",

  "theme.light": "लाइट",
  "theme.dark": "डार्क",
  "theme.toLight": "लाइट थीमवर बदला",
  "theme.toDark": "डार्क थीमवर बदला",
  "theme.current": "थीम: {theme}",

  "details.label": "विश्लेषणात्मक व्यू",
  "details.hint": "प्रत्येक निकालामागील स्कोर, श्रेणी आणि तक्ते दाखवा",
  "details.on": "विश्लेषणात्मक व्यू सुरू",
  "details.off": "विश्लेषणात्मक व्यू बंद",
  "details.analyst": "विश्लेषणात्मक व्यू",

  "footer.text": "प्रत्यक्ष ग्राहकांच्या प्रश्नांवर AI असिस्टंट तुमच्या ब्रँडची किती वेळा शिफारस करतात, याचे मोजमाप.",

  "notFound.title": "पान सापडले नाही",
  "notFound.body": "विनंती केलेले पान अस्तित्वात नाही किंवा हलवले गेले आहे.",
  "notFound.back": "ओव्हरव्ह्यूकडे परत जा",

  "errorBoundary.title": "त्रुटी आली",
  "errorBoundary.body": "या पानावर एक अनपेक्षित त्रुटी आली. पान रीलोड केल्याने सहसा ही समस्या दूर होते.",
  "errorBoundary.reload": "पान रीलोड करा",
  "errorBoundary.goToDashboard": "ओव्हरव्ह्यूकडे जा",

  "loading": "लोड होत आहे…",
  "error.network": "सर्व्हरशी संपर्क होऊ शकला नाही. सर्व्हर सुरू असल्याची खात्री करून पुन्हा प्रयत्न करा.",
  "retry": "पुन्हा प्रयत्न करा",
  "save": "सेव्ह करा",
  "saving": "सेव्ह होत आहे…",
  "cancel": "रद्द करा",
  "delete": "हटवा",
  "add": "जोडा",
  "on": "सुरू",
  "off": "बंद",
  "showMore": "अधिक दाखवा",
  "showLess": "कमी दाखवा",
  "offline": "सर्व्हरशी संपर्क होत नाही. तुमचे कनेक्शन तपासा आणि पुन्हा प्रयत्न करा.",
  "lock.title": "ॲडमिन पासवर्ड",
  "lock.hint": "हा सार्वजनिक डेमो आहे. खऱ्या AI सोबत तपासणी, होस्टेड AI ने मसुदा आणि उदाहरण ब्रँडमधील बदल यांसाठी ॲडमिन पासवर्ड लागतो. ब्राउझिंग आणि सिम्युलेटेड डेटावरील तपासणी सर्वांसाठी खुली आहे.",
  "lock.hintDetail": "सर्व्हरचा ADMIN_TOKEN, जो X-Admin-Token म्हणून पाठवला जातो आणि फक्त या ब्राउझर टॅबमध्ये राहतो.",
  "lock.cancelled": "यासाठी ॲडमिन पासवर्ड लागतो. सिम्युलेटेड डेटावरील तपासणी त्याशिवायही चालते.",
  "serverWaking": "सर्व्हरला सक्रिय केले जात आहे. फ्री होस्टिंगवर पहिल्यांदा लोड होण्यास सुमारे 30 सेकंद लागू शकतात.",
  "none": "काहीही नाही",

  "nav.app": "BrandVisibility ॲप उघडा",
};
