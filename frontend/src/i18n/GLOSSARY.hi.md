# Hindi glossary (हिंदी शब्दावली)

This file covers the Hindi UI strings in `src/i18n/hi/common.ts`, `hi/dashboard.ts` and `hi/pages.ts`.

The target reader is a small shop owner in Mumbai, so the Hindi is **spoken, everyday Hindi**, not
official or Sanskritised Hindi. It always uses the respectful "आप" form. Buttons are short commands
("अभी जाँचें", "सेव करें"). Numbers stay in Western digits.

Some names stay in Latin script: AI, Google, Google Maps, Justdial, Zomato, Swiggy, Instagram,
WhatsApp, YouTube, Reels, Quora, Reddit, Facebook, ChatGPT, Gemini, QR, ID, API key. Everyday loanwords
go in Devanagari: स्कोर, लिस्ट, पोस्ट, रिव्यू, फ़ोटो, वेबसाइट, ऑप्शन, सेव, डेमो.

## Core terms

| English | Hindi used | Notes / alternatives rejected |
|---|---|---|
| AI assistant | AI असिस्टेंट (or just AI) | "कृत्रिम बुद्धि" is too formal. "AI" stays in Latin script. |
| shop | दुकान | Shop names are never translated. |
| check (noun) | जाँच | "Last checked" = "पिछली जाँच: …" |
| Check now / Check again | अभी जाँचें / फिर से जाँचें | |
| question | सवाल | "प्रश्न" is too formal. The plural is also सवाल ("{n} सवाल"). |
| answer | जवाब | "उत्तर" is too formal. |
| results | नतीजे | "परिणाम" is too formal. |
| recommend / suggest | सुझाना ("सुझाते हैं") | "अनुशंसा करना" is officialese. |
| suggestion (recommendation) | सुझाव | "अनुशंसा" was rejected. |
| mention / named | नाम लेना / नाम आना; ज़िक्र (details view) | "उल्लेख" is formal. |
| named first | सबसे पहले नाम आया | |
| visibility ("How visible is your shop?") | "AI पर आपकी दुकान कितनी दिखती है?" | "दृश्यता" was rejected. |
| score | स्कोर | |
| points (score change) | अंक | People know it from exam marks. "पॉइंट" also works. |
| likely range | संभावित रेंज / "शायद {lo} से {hi} के बीच" | "सीमा" felt formal on the simple view. |
| confidence interval | भरोसे की रेंज (CI) | Used in the details view with "95%". |
| rough (results) | मोटा अंदाज़ा | This is what people naturally say for a rough estimate. |
| rating: Rarely / Sometimes / Often recommended / Top choice | कम ही सुझाते हैं / कभी-कभी सुझाते हैं / अक्सर सुझाते हैं / पहली पसंद | Identical in `dashboard.hero.rating.*` and `pages.rating.*`. |
| competitor | मुकाबले वाली दुकान | "प्रतिस्पर्धी" is too formal. "कॉम्पिटिटर" was the second choice. |
| practice data (synthetic) | डेमो डेटा | "अभ्यास डेटा" sounds bookish. "डेमो" is widely understood. |
| saved answers (replay) | सेव किए हुए जवाब | |
| real AI answers | असली AI जवाब | |
| Options | ऑप्शन | "विकल्प" is fine, but "ऑप्शन" is what people say. |
| How thorough: Quick / Standard / Thorough | कितनी गहराई से: फटाफट / सामान्य / गहराई से | "Thorough" appears in bold in `hero.rangeWide` as **गहराई से**. |
| Skip | छोड़ें | |
| rate limit / busy | बिज़ी (रेट लिमिट) | |
| Connected AIs | जुड़े हुए AI | |
| connected / not set up | जुड़ा है / सेट नहीं है | |
| question type (intent) | सवाल का प्रकार | "किस्म" was the second choice. |
| area / locality | इलाका | "क्षेत्र" is too formal. |
| customers | ग्राहक | |
| review | रिव्यू | "समीक्षा" is too formal. |
| listing | लिस्टिंग / "लिस्ट करवाएँ" | |
| effort | मेहनत | "प्रयास" is formal. |
| priority | प्राथमिकता | This is formal, but it only appears in the details view. |
| confidence (of a suggestion) | भरोसा | |
| problem / gap | कमी (gaps) | "अंतर" would be read as "difference". |
| inferred | अनुमानित | Details view only. |
| Coverage | नाम आने की दर (Coverage); short form कवरेज in table columns | |
| Prominence | लिस्ट में जगह (Prominence) | |
| Share of voice | हिस्सेदारी (Share of voice) | |
| composite score | कुल स्कोर (composite) | |
| admissible | तुलना के लायक (admissible) | |
| bootstrap / clusters / samples | English kept in brackets after a Hindi gloss | These are for examiners. |
| Details / numbers behind this | इसके पीछे के आँकड़े / आँकड़े | |
| Check ID | जाँच ID | |
| Model | मॉडल | |
| API key | API key (Latin) | "की" in Devanagari would be read as the postposition "की". |
| comma-separated | कॉमा (,) लगाकर अलग करें | |

## Please review (least sure)

A native speaker should check these before the demo:

1. **`hero.rating.rare` / `pages.rating.rarely` = "कम ही सुझाते हैं"**. This is short and has no subject ("they rarely suggest [you]"). An alternative is "बहुत कम सुझाते हैं". I avoided the passive "सुझाई जाती है" because its gender depends on the shop name.
2. **`origin.synthetic` = "डेमो डेटा"** for "Practice data". Please check that shop owners understand "डेमो". The alternative is "नमूना डेटा".
3. **`run.depth.quick/standard/thorough` = "फटाफट / सामान्य / गहराई से"**. "फटाफट" is very colloquial. "जल्दी" is the alternative.
4. **`add.category.placeholder`, `add.audiences.placeholder`, `add.jobs.placeholder`** keep English examples ("जैसे groceries", "जैसे families, office workers", "जैसे get a quick breakfast…"). The backend builds English questions from these fields (for example "how do I {job}"), so English input works best. I also made two hints more specific than the English source:
   - `add.jobs.hint` says to start with an English action word.
   - `add.err.latin` says "अंग्रेज़ी अक्षर (A–Z)".
   Please check that this reads naturally.
5. **`action.submit_to_directory.step1`** renders "Claim your profile" as "बनाएँ या अपने नाम करें". Please check that "अपने नाम करें" is clear.
6. **`why.competitive`**: "…में {competitor} आपसे पहले आती है". The feminine form assumes "दुकान". For a masculine-sounding name such as "Jumbo King" it still reads acceptably.
7. **`add.doneNoCount`** = "**{shop}** जोड़ दी गई है" also assumes a feminine "दुकान".
8. **`dashboard.intent.*`** are the example question phrases inside "why" sentences, for example “मेरे पास सबसे अच्छा …” and “… के लिए कहाँ जाऊँ”. Please check that they read like real questions.
9. **`gaps.num.sources` = "जिन सोर्स में नाम नहीं"** and **`gaps.num.beat` = "मुकाबले वाली आगे"** are short table labels in the details view. They are a bit telegraphic.
10. **`recs.effortLabel.5` = "पोज़िशनिंग"** is a transliteration because I found no simple Hindi word. It appears in the details view only.
