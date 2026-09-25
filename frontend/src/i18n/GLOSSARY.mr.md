# Marathi glossary (मराठी शब्दसूची)

Used by `src/i18n/mr/*.ts`. The reader is a shopkeeper in Mumbai or Pune, so the wording is spoken
Marathi, not official Marathi. We always use **तुम्ही**. Verbs use the spoken `-ं` endings
(झालं, घेतलं, दुकानाचं). Plural nouns use `-े` (उत्तरे, दुकाने, पाने). Buttons are short commands
(आता तपासा, सेव्ह करा).

Kept in Latin script: AI, Google, Google Maps, Google Business Profile, Justdial, Zomato, Swiggy,
Instagram, WhatsApp (Business), YouTube (Shorts), Reels, Quora, Reddit, Facebook, ChatGPT, Gemini,
Groq, QR, ID, API key, and all shop names, question texts and AI answers. Numbers use Western digits.

Postpositions after a `{var}` are written as a separate word (`{ais} ला`, `{ai} ने`,
`{competitor} पेक्षा`, `{shop} कडे`). Marathi apps commonly do this with Latin-script names. Where
a sentence could be rebuilt so the name needs no ending, it was (`who.leader`, `palette.questionsFor`).

## Core terms

| English | Marathi | Notes / alternatives rejected |
|---|---|---|
| shop | दुकान / दुकाने | "स्टोअर" rejected; दुकान is what every shopkeeper says |
| your shops | तुमची दुकाने | |
| AI assistant | AI असिस्टंट | "AI सहाय्यक" is too bookish. Often just "AI" |
| question | प्रश्न | same form for singular and plural |
| answer | उत्तर / उत्तरे | "उत्तरं" (spoken) rejected so the plural is written the same way everywhere |
| check (noun) | तपासणी | "चेक" rejected |
| check (verb / button) | तपासा — आता तपासा, पुन्हा तपासा | |
| results | निकाल | "रिझल्ट" rejected |
| score | स्कोर | "स्कोअर" and "गुण" rejected. स्कोर is the everyday spelling |
| points (of score) | पॉइंट | "गुण" sounds like exam marks |
| recommend / suggest | सुचवणे (सुचवतात, सुचवलं) | "शिफारस करणे" is too formal |
| suggestion | सूचना | same form for singular and plural |
| competitor | स्पर्धक | "प्रतिस्पर्धी" is too formal |
| customer | ग्राहक | |
| mentioned / named | नाव घेतलं / नाव आलं | "उल्लेख" is used only in the Details view |
| named first | सगळ्यात आधी नाव | "पहिलं नाव" alone was ambiguous (first name) |
| practice data (synthetic) | सराव डेटा | "डेमो डेटा" and "नमुना डेटा" were rejected. See the review list |
| saved answers (replay) | सेव्ह केलेली उत्तरे | "जतन केलेली" is bookish; it also matches the "सेव्ह करा" button |
| real AI answers | खरी AI उत्तरे | |
| connected AIs | जोडलेले AI | "कनेक्टेड" rejected |
| not set up | सेट केलेला नाही | |
| Options | पर्याय | |
| Quick / Standard / Thorough | झटपट / नेहमीचं / बारकाईने | "सखोल" rejected as bookish. `hero.rangeWide` repeats **बारकाईने** word for word |
| How thorough | किती बारकाईने | |
| Why? | का? | |
| What to do next | आता काय करायचं | |
| effort (simple view) | थोडं काम / मोठं काम / झटपट होईल | |
| effort (Details view) | मेहनत | |
| priority | प्राधान्य | |
| confidence | खात्री | |
| likely range | अंदाजे रेंज | simple-view word for the CI band |
| confidence interval | विश्वास मर्यादा (CI) | Details view only |
| Coverage | कव्हरेज (Coverage) | |
| Prominence | लिस्टमधलं स्थान (Prominence) | "ठळकपणा" is literal but meaningless here |
| Share of voice | चर्चेतला वाटा (Share of voice) | |
| composite score | एकूण स्कोर (composite) | |
| admissible | तुलना करता येईल (admissible) | "ग्राह्य" is legal jargon |
| gap / problem | अडचण / अडचणी (gaps) | "त्रुटी" is too formal; "समस्या" is fine but longer |
| rating: rarely / sometimes / often / top | क्वचितच सुचवतात / कधीकधी सुचवतात / बऱ्याचदा सुचवतात / पहिली पसंती | identical in `dashboard.hero.rating.*` and `pages.rating.*`. The subject (AI) is left implied |
| review (customer) | रिव्ह्यू | |
| list / listing | लिस्ट / लिस्टिंग | "यादी" is also natural, but लिस्ट was chosen to match "लिस्ट करा" |
| post / photo / website / online | पोस्ट / फोटो / वेबसाइट / ऑनलाइन | |
| area / locality | भाग / परिसर | |
| comma-separated | कॉमाने (,) वेगळं करा | "स्वल्पविराम" is bookish |
| Details / numbers behind this | आकडे / यामागचे आकडे | |
| Loading… | लोड होत आहे… | |
| Save / Cancel / Delete / Edit | सेव्ह करा / रद्द करा / काढून टाका / बदला | |
| Skip | वगळा (state: वगळलं) | |
| rate limit (busy) | बिझी (rate limit) | the English term is kept in brackets |

## Please review before the demo (native speaker)

These are the strings I am least sure about. Please read them aloud in context:

1. `origin.synthetic` / `banner.synthetic.title` — **सराव डेटा**. Will a shopkeeper understand
   "सराव" as "made-up / demo"? The alternative is **डेमो डेटा**, which may be clearer to Mumbai users.
2. `hero.first_*` / `who.first_*` — **सगळ्यात आधी नाव** for "named first". Check that it doesn't read
   as "name came earliest in time".
3. `run.plan_*` — **आम्ही {ais} ला {n} प्रश्न विचारू.** Here {ais} is "Google Gemini आणि Groq". Check
   that the "ला" after a list of Latin names reads naturally.
4. `why.presence.providerNone` — **{ai} ने त्याच्या उत्तरांमध्ये…** "त्याच्या" assumes the AI is
   masculine. Is "त्याच्या" OK, or should it be dropped?
5. `action.comparison_page.title` — **{competitor} पेक्षा तुमचं वेगळेपण दाखवा**. Check that
   "वेगळेपण" is natural for "how you are different".
6. `metrics.prominence` — **लिस्टमधलं स्थान (Prominence)**. Check that it is clear to an examiner.
7. `metrics.sov` — **चर्चेतला वाटा (Share of voice)**. This is a coined term. Would a plain
   **"उल्लेखांमधला वाटा"** be better?
8. `admission.ok/no` — **जुन्या तपासण्यांशी तुलना करता येईल / येणार नाही**. Check that the meaning
   ("statistically fit to compare over time") comes through.
9. `add.jobs.hint` — this asks users to start each item with an **English** verb ("get …", "find …"),
   because the question templates are English. Check that this instruction is clear, or whether the
   team would rather accept Marathi input here.
10. `add.aliases.placeholder` — **उदा. Patil Stores, Patil kakanche dukan**. This is a romanised
    Marathi nickname adapted from the Hindi "Sharma ji ki dukaan". Check the spelling.
11. `run.depth.standard` — **नेहमीचं** for "Standard". The alternative is "साधारण".
12. `trend.title` — **वेळेनुसार बदल** for "Over time".
13. `hero.change.*` — **{n} पॉइंट वाढ / घट**. Check whether "पॉइंट" or "गुण" is better.
14. `recs.effortLabel.*` / `recs.class.*` — **लिस्टिंग / कंटेंट / पोझिशनिंग / प्रॉडक्ट / मेसेज**. These
    are left as English loanwords on purpose (Details view only).
15. `palette.navigate` — **निवडा** for the "↑↓ move" keyboard hint. This is a free translation.
