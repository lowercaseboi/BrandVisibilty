import type { modules as enModules } from "../en/modules";

// Marathi strings for the modules namespace — Analysis and Gaps & evidence modules. Professional
// written register, "तुम्ही" form. See src/i18n/GLOSSARY.mr.md. Keep {placeholders} and **bold** exactly.
export const modules: Record<keyof typeof enModules, string> = {
  // ---- Analysis
  "analysis.empty.body2": "यासाठी काही मिनिटे लागतात — रन पॅनेलमधून सुरू करा.",
  "analysis.trend.eyebrow": "कालांतराने",
  "analysis.deeper.title": "सखोल आकडेवारी",
  "analysis.deeper.summary": "रनची माहिती, स्कोर, तुलनीयता, प्रत्येक AI आणि स्पर्धक",
  "analysis.deeper.facts": "हे विश्लेषण",

  // ---- Gaps & evidence: left pane
  "gaps.eyebrow": "निश्चित नियमांनी आढळलेले",
  "gaps.select": "निवडा",
  "gaps.none.body": "पहिल्या विश्लेषणानंतर गॅप आणि त्यामागील AI प्रतिसाद इथे दिसतील.",
  "gaps.none.cta": "विश्लेषणाकडे जा",

  // ---- Gaps & evidence: right pane
  "evidence.forGap_one": "या गॅपमागील **{n}** प्रतिसाद दाखवत आहोत.",
  "evidence.forGap_other": "या गॅपमागील **{n}** प्रतिसाद दाखवत आहोत.",
  "evidence.forRefs_one": "या शिफारसीमागील **{n}** प्रतिसाद दाखवत आहोत.",
  "evidence.forRefs_other": "या शिफारसीमागील **{n}** प्रतिसाद दाखवत आहोत.",
  "evidence.found": "यापैकी {found} या विश्लेषणातील AI प्रतिसाद आहेत.",
  "evidence.noneLinked": "या विश्लेषणातील कोणताही AI प्रतिसाद इथे जोडलेला नाही — हा पुरावा इतर स्रोतांकडे निर्देश करतो.",
  "evidence.clear": "काढा",
  "evidence.clearAria": "निवड काढा आणि सर्व प्रतिसाद दाखवा",
  "evidence.hint": "एखादा गॅप निवडा, म्हणजे खाली फक्त त्यामागील प्रतिसाद दिसतील.",
  "evidence.all": "सर्व प्रतिसाद",
  "evidence.showMore_one": "आणखी {n} दाखवा",
  "evidence.showMore_other": "आणखी {n} दाखवा",
  "evidence.resetFilters": "फिल्टर काढा",
  "evidence.gapMissing": "तो गॅप या विश्लेषणात नाही — तो दरम्यानच्या काळात दूर झाला असेल. त्याऐवजी सर्व प्रतिसाद दाखवत आहोत.",
  "evidence.olderRun": "तुम्ही {when} चे जुने विश्लेषण पाहत आहात. त्याचे गॅप आणि प्रतिसाद दाखवले आहेत.",
  "evidence.olderRunUnknown": "तुम्ही सर्वात नवीन नसलेले विश्लेषण पाहत आहात.",
  "evidence.toLatest": "नवीनतम पाहा",
};
