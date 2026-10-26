# Hindi glossary (हिंदी शब्दावली)

This file covers the Hindi UI strings in all 7 namespaces: `src/i18n/hi/common.ts`, `hi/dashboard.ts`,
`hi/pages.ts`, `hi/hub.ts`, `hi/brandinfo.ts`, `hi/modules.ts` and `hi/board.ts`.

**Register: professional business Hindi.** The tone matches the English copy — an analytics
product report — and reads like a well-made Indian banking or analytics app. It always uses "आप",
avoids chatty phrasing, and keeps established business loanwords where Indian professionals use
them (स्कोर, विज़िबिलिटी, कॉन्फ़िडेंस, बेंचमार्क) rather than coining Sanskritised terms.
Buttons are short imperatives ("विश्लेषण चलाएँ", "सेव करें"). Numbers stay in Western digits.

Kept in Latin script: AI, Google, Google Business Profile, Justdial, IndiaMART, Zomato, Amazon,
Instagram, WhatsApp (Business), YouTube (Shorts), Reels, Quora, Reddit, Facebook, ChatGPT, Gemini,
Groq, QR, ID, API key, LinkedIn, X, Facebook Page, Google Business, FAQ, VI, the server settings
(SECRET_KEY, ADMIN_TOKEN), API scopes, URNs and URLs, the metric names Coverage / Prominence / Share of voice, the depth options
Quick / Standard / Thorough (they must match `hero.rangeWide`), and all brand names, question texts
and AI responses.

## Core terms

| English | Hindi | Notes |
|---|---|---|
| AI assistant | AI असिस्टेंट | |
| question (customer question) | प्रश्न (replaces क्वेरी, to match the /questions URL and API) | "सवाल" reads casual |
| question set | प्रश्न सेट | |
| response (AI answer) | जवाब | "उत्तर" is also correct; जवाब reads more naturally in UI |
| analysis (one run) | विश्लेषण | Run analysis = "विश्लेषण चलाएँ" |
| run (technical) | रन | Run ID = "रन ID" |
| results | परिणाम | |
| report | रिपोर्ट | |
| visibility | विज़िबिलिटी | "दृश्यता" is correct but stiff in product UI |
| visibility tiers | कम / मध्यम / मज़बूत विज़िबिलिटी / कैटेगरी लीडर | `pages.rating.*` |
| score / points | स्कोर / अंक | |
| likely range | संभावित रेंज | |
| confidence interval | कॉन्फ़िडेंस इंटरवल (95% CI) | |
| precision (low) | सटीकता (कम) | |
| recommend / recommendation | सिफ़ारिश करना / सिफ़ारिश, सुझाव | "Recommended actions" = "सुझाए गए कदम" |
| rationale | कारण | |
| effort / impact | प्रयास / अनुमानित प्रभाव | effort levels: कम / मध्यम / अधिक |
| mention | उल्लेख | |
| ranked first | पहले स्थान पर | |
| competitor | प्रतिस्पर्धी | |
| competitive landscape | प्रतिस्पर्धी परिदृश्य | |
| markets (locations) | बाज़ार | |
| target audience | लक्षित ग्राहक | |
| alternate names | वैकल्पिक नाम | |
| simulated / synthetic / practice data | सिम्युलेटेड डेटा | the ONE term for made-up AI answers (replaces "डेमो डेटा", "प्रैक्टिस डेटा", "सैंपल डेटा"); a run on it = सिम्युलेटेड रन |
| replayed responses | रीप्ले किए गए जवाब | |
| gap | गैप | plural also गैप ("{n} गैप") |
| admissible | स्वीकार्य | details view |
| composite score | संयुक्त स्कोर | one term everywhere (not "कम्पोज़िट स्कोर") |
| re-weighted (renormalised) | बाकी भागों का भार फिर से बाँटा गया | |
| smallest detectable change (MDE) | न्यूनतम पहचान-योग्य बदलाव | "reliably detect" = भरोसे के साथ पहचानना / पुष्टि करना |
| no significant change | कोई उल्लेखनीय बदलाव नहीं | not "कोई खास बदलाव नहीं" |
| confounded (impact ledger) | दूसरे कदम से असर अलग नहीं किया जा सकता | |
| evidence | प्रमाण | not "साक्ष्य"; "Gaps & Evidence" = गैप और प्रमाण |
| workspace / benchmarks | वर्कस्पेस / बेंचमार्क | home page eyebrows |

## Hub, Details, Recommendation Engine and Campaign Studio terms

| English | Hindi | Notes |
|---|---|---|
| module | मॉड्यूल | module titles: विवरण (Details), विश्लेषण (Analysis), गैप और प्रमाण, सिफ़ारिश इंजन |
| brand hub | ब्रांड हब | phone tab: हब |
| board (phone tab for recommendations) | सुझाव | tabs are ONE word: हब / विवरण / विश्लेषण / गैप / सुझाव |
| Recommendation Engine | सिफ़ारिश इंजन | eyebrow "Recommendations" = सिफ़ारिशें |
| lanes (status lanes on phones) | स्थिति के अनुसार सिफ़ारिशें | "Move to…" = यहाँ ले जाएँ… |
| statuses | सुझाया गया / बाद के लिए सेव / जारी / पूर्ण / अस्वीकृत | |
| checklist (onboarding) | चेकलिस्ट; "Get set up" = शुरुआत करें | step = चरण |
| campaign / Campaign Studio | कैंपेन / कैंपेन स्टूडियो | masculine: "कैंपेन बनाया गया" |
| draft (noun / verb) | ड्राफ़्ट / ड्राफ़्ट तैयार करना | |
| approve / approved / approval | स्वीकृत करें / स्वीकृत / स्वीकृति | "Approve & publish" step = स्वीकृति और प्रकाशन |
| publish | प्रकाशित करें | status "Posted" = पोस्ट किया गया; "Didn't go out" = प्रकाशित नहीं हुआ |
| post (noun / verb) | पोस्ट / पोस्ट करना | |
| channel | चैनल | |
| platform | प्लेटफ़ॉर्म | |
| account / connected account | अकाउंट / कनेक्टेड अकाउंट | |
| connect / reconnect / disconnect | कनेक्ट करें / फिर से कनेक्ट करें / डिस्कनेक्ट करें | "Connected" pill = कनेक्टेड |
| sign-in | साइन-इन | |
| token / admin password / posting password | टोकन / एडमिन पासवर्ड / पोस्टिंग पासवर्ड | |
| practice channel (campaign sandbox) | प्रैक्टिस (चैनल / रन / पोस्ट) | ONLY for the campaign sandbox where nothing is posted — never for analysis data |
| export / download pack | एक्सपोर्ट / डाउनलोड पैक | |
| deliverable (website text) | वेबसाइट टेक्स्ट | kinds: सोशल पोस्ट, लेख, FAQ, प्रोफ़ाइल टेक्स्ट, वीडियो स्क्रिप्ट, रिव्यू अनुरोध, डायरेक्टरी लिस्टिंग, आउटरीच ईमेल, कम्युनिटी जवाब |
| variant (a channel's post) | (उस चैनल की) पोस्ट | the word "variant" is never shown |
| copy (post text) | टेक्स्ट | "Template copy" = टेम्पलेट टेक्स्ट |
| hashtag / image | हैशटैग / इमेज | |
| issue (thing to fix) | ठीक करने वाली बात | "{n} things to fix" = "{n} बातें ठीक करनी हैं" |
| claim | दावा | |
| opportunity / uptake | अवसर / मानी गई पूर्ति दर | Analytical view only |
| coverage matrix | प्रश्नों की पहुँच (eyebrow कवरेज) | not the Coverage metric, so Devanagari |
| profile | प्रोफ़ाइल | sample brand = उदाहरण ब्रांड |

## Notes

- The `intent.*` examples in `dashboard.ts` (“best … near me”) stay in English: they quote the
  English question templates the app actually runs.
- Form placeholders for fields that feed those templates (category, audience, customer needs) stay
  in English for the same reason.
