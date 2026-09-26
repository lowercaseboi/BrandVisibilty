# Marathi glossary (मराठी शब्दसूची)

Used by `src/i18n/mr/*.ts`.

**Register: professional written Marathi (प्रमाण मराठी).** The tone matches the English copy — an
analytics product report. We use **तुम्ही**, the written `-े` endings (झाले, केले, ब्रँडचे) rather
than the spoken `-ं` forms, and no chatty phrasing. Established business loanwords are kept where
Marathi professionals use them (स्कोर, क्वेरी, बेंचमार्क, कॉन्फिडन्स). Buttons are short
imperatives (विश्लेषण चालवा, सेव्ह करा).

Kept in Latin script: AI, Google, Google Business Profile, Justdial, IndiaMART, Zomato, Amazon,
Instagram, WhatsApp (Business), YouTube (Shorts), Reels, Quora, Reddit, Facebook, ChatGPT, Gemini,
Groq, QR, ID, API key, the metric names Coverage / Prominence / Share of voice, the depth options
Quick / Standard / Thorough (they must match `hero.rangeWide`), and all brand names, query texts
and AI responses. Numbers use Western digits.

Postpositions after a `{var}` are written as a separate word (`{ais} ला`, `{ai} ने`,
`{competitor} सोबत`), as Marathi apps commonly do with Latin-script names.

## Core terms

| English | Marathi | Notes |
|---|---|---|
| brand | ब्रँड (masc.: तुमचा ब्रँड, ब्रँडचे नाव) | |
| AI assistant | AI असिस्टंट | |
| query (customer question) | क्वेरी (plural: क्वेरी / क्वेरींमध्ये) | |
| query set | क्वेरी संच | |
| response (AI answer) | प्रतिसाद (same form in the plural) | replaces the spoken "उत्तरे" |
| analysis (one run) | विश्लेषण | Run analysis = "विश्लेषण चालवा" |
| run (technical) | रन | Run ID = "रन ID" |
| results / report | निकाल / अहवाल | |
| visibility | दृश्यता | standard in Marathi business writing |
| visibility tiers | कमी / मध्यम / भक्कम दृश्यता / कॅटेगरी लीडर | `pages.rating.*` |
| score / points | स्कोर / गुण | |
| likely range | संभाव्य श्रेणी | |
| confidence interval | कॉन्फिडन्स इंटरव्हल (95% CI) | |
| precision (low) | अचूकता (कमी) | |
| recommend / recommendation | शिफारस करणे / शिफारस, शिफारसी | "Recommended actions" = "शिफारस केलेल्या कृती" |
| rationale | कारण | |
| effort / impact | प्रयत्न / अंदाजित परिणाम | effort levels: कमी / मध्यम / जास्त |
| mention | उल्लेख | |
| ranked first | पहिल्या स्थानावर | |
| competitor | स्पर्धक | |
| competitive landscape | स्पर्धात्मक चित्र | |
| markets (locations) | बाजारपेठा | |
| target audience | लक्ष्य ग्राहक | |
| alternate names | पर्यायी नावे | |
| comma-separated | स्वल्पविरामाने वेगळे करा | |
| simulated data | सिम्युलेटेड डेटा | replaces the old "सराव डेटा" |
| replayed responses | रीप्ले केलेले प्रतिसाद | |
| gap | गॅप | details view |
| admissible | स्वीकारार्ह | details view |
| workspace / benchmarks | वर्कस्पेस / बेंचमार्क | home page eyebrows |

## Please review before the demo (native speaker)

1. `rating.often` — **भक्कम दृश्यता** for "Strong visibility". "मजबूत" is the alternative.
2. `why.presence.provider` — **{ai} ने त्याच्या…** assumes the AI is masculine. Drop "त्याच्या" if it reads oddly.
3. `who.title` — **स्पर्धात्मक चित्र** for "Competitive landscape".
4. `add.jobs.hint` asks for customer needs in **English**, because the query templates are English.
