# Marathi glossary (मराठी शब्दसूची)

Used by `src/i18n/mr/*.ts` — all 7 namespaces: `common`, `dashboard`, `pages`, `hub`, `brandinfo`,
`modules`, `board`.

**Register: professional written Marathi (प्रमाण मराठी).** The tone matches the English copy — an
analytics product report. We use **तुम्ही**, the written `-े` endings (झाले, केले, ब्रँडचे) rather
than the spoken `-ं` forms, and no chatty phrasing. Established business loanwords are kept where
Marathi professionals use them (स्कोर, बेंचमार्क, कॉन्फिडन्स). Buttons are short
imperatives (विश्लेषण चालवा, सेव्ह करा).

Kept in Latin script: AI, Google, Google Business Profile, Justdial, IndiaMART, Zomato, Amazon,
Instagram, WhatsApp (Business), YouTube (Shorts), Reels, Quora, Reddit, Facebook, ChatGPT, Gemini,
Groq, X, LinkedIn, Facebook Page (the platform term "Page"), FAQ, QR, ID, VI (visibility-index
points in the Analytical view), API key / secret, server settings (SECRET_KEY, ADMIN_TOKEN), URLs and
OAuth scope names, the metric names Coverage / Prominence / Share of voice, the depth options
Quick / Standard / Thorough (they must match `hero.rangeWide`), and all brand names, question texts
and AI responses. Numbers use Western digits.

Postpositions after a `{var}` are written as a separate word (`{ais} ला`, `{ai} ने`,
`{competitor} सोबत`), as Marathi apps commonly do with Latin-script names.

## Core terms

| English | Marathi | Notes |
|---|---|---|
| brand | ब्रँड (masc.: तुमचा ब्रँड, ब्रँडचे नाव) | |
| AI assistant | AI असिस्टंट | |
| question (customer question) | प्रश्न (replaces क्वेरी, to match the /questions URL and API; masc., plural: प्रश्न, oblique: प्रश्नांमध्ये/प्रश्नांवर) | |
| question set | प्रश्न संच | |
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
| composite score | संयुक्त स्कोर | one term everywhere (replaces "कंपोझिट स्कोर") |
| partial run | आंशिक रन | |
| on a scale of 0 to 100 | 0 ते 100 च्या मोजपट्टीवर | not "प्रमाण" (= proportion) |
| no significant change | लक्षणीय बदल नाही | |
| "best of" lists | “सर्वोत्तम” याद्या | same in title, steps and reasoning |
| page (web page) | पान | not "पेज"; except the Facebook/LinkedIn product "Page" |

## Hub, modules and Recommendation Engine (`hub`, `modules`, `board`)

| English | Marathi | Notes |
|---|---|---|
| hub / brand hub | हब / ब्रँड हब | phone tab: हब |
| module | मॉड्यूल | |
| Details / Analysis (modules) | तपशील / विश्लेषण | also the phone tabs |
| Gaps & Evidence | गॅप आणि पुरावे | phone tab: गॅप |
| Recommendation Engine | शिफारस इंजिन | |
| board (phone tab) | शिफारसी | one word; "बोर्ड" means nothing to users |
| lanes (status lanes) | स्थितीनुसार शिफारसी | |
| status | स्थिती | Suggested / Saved / In progress / Done / Rejected = सुचवलेले / जतन केलेले (नंतरसाठी जतन) / सुरू आहे / पूर्ण / नाकारलेले |
| suggestion | सूचना | "recommendation" stays शिफारस |
| evidence | पुरावा, पुरावे | |
| reasoning | कारणमीमांसा | |
| opportunity / uptake | संधी / भरपाई | Analytical view |
| onboarding checklist | सुरुवातीची चेकलिस्ट | "Get set up" = सुरुवात करा |
| campaign | मोहीम (fem.; pl. मोहिमा, obl. मोहिमेचा) | |
| Campaign Studio | स्टुडिओ | |
| draft (n.) | मसुदा (masc.; obl. मसुद्यात) | "drafting" = मसुदा तयार होत आहे |
| approve / approval | मंजूर करा / मंजुरी | "Approve & publish" = मंजूर करा आणि प्रकाशित करा |
| publish | प्रकाशित करा | |
| post (n. / v.) | पोस्ट (fem.: ही पोस्ट, पोस्ट झाली) / पोस्ट करा | |
| channel | चॅनेल (neut.; pl. चॅनेल, verb agrees: चॅनेल निवडली) | channel names stay Latin |
| platform | प्लॅटफॉर्म | |
| account | अकाउंट (neut.; pl. अकाउंट) | |
| connect / disconnect / reconnect | कनेक्ट करा / डिस्कनेक्ट करा / पुन्हा कनेक्ट करा | state: कनेक्टेड / कनेक्ट नाही |
| shared account | सामायिक अकाउंट | |
| sign-in | साइन-इन | |
| access token / admin password | ॲक्सेस टोकन / ॲडमिन पासवर्ड | posting password = पोस्टिंग पासवर्ड |
| expired | मुदत संपली | |
| deliverable (website text) | वेबसाइट मजकूर | the per-kind names: लेख, FAQ, प्रोफाइल मजकूर, व्हिडिओ स्क्रिप्ट… |
| variant (a channel's post) | (त्या चॅनेलची) पोस्ट | not translated as a separate term |
| practice channel / run (sandbox) | सराव चॅनेल / सराव रन | campaign sandbox only; *data* is सिम्युलेटेड डेटा |
| export / download pack | एक्सपोर्ट / डाउनलोड पॅक | |
| hashtag / image | हॅशटॅग / इमेज | |
| claim (unbacked) | दावा | |
| characters (limit) | अक्षरे | |
| coverage matrix (questions × city) | प्रश्नांची व्याप्ती | not the Coverage metric |

## Please review before the demo (native speaker)

1. `rating.often` — **भक्कम दृश्यता** for "Strong visibility". "मजबूत" is the alternative.
2. `why.presence.provider` — **{ai} ने त्याच्या…** assumes the AI is masculine. Drop "त्याच्या" if it reads oddly.
3. `who.title` — **स्पर्धात्मक चित्र** for "Competitive landscape".
4. `add.jobs.hint` asks for customer needs in **English**, because the question templates are English.
5. `hub.tab.board` — **शिफारसी** for the "Board" phone tab (one word, fits the 360px bar).
6. `board.campaign.*` — **मोहीम** for "campaign"; "कॅम्पेन" is the alternative if users find मोहीम too formal.
7. `board.campaign.preview.fb*` — the Facebook/LinkedIn mock buttons use लाइक / कमेंट / शेअर / रिपोस्ट; check against the apps' own Marathi UI if needed.
