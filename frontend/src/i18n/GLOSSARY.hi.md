# Hindi glossary (हिंदी शब्दावली)

This file covers the Hindi UI strings in `src/i18n/hi/common.ts`, `hi/dashboard.ts` and `hi/pages.ts`.

**Register: professional business Hindi.** The tone matches the English copy — an analytics
product report — and reads like a well-made Indian banking or analytics app. It always uses "आप",
avoids chatty phrasing, and keeps established business loanwords where Indian professionals use
them (स्कोर, विज़िबिलिटी, कॉन्फ़िडेंस, बेंचमार्क) rather than coining Sanskritised terms.
Buttons are short imperatives ("विश्लेषण चलाएँ", "सेव करें"). Numbers stay in Western digits.

Kept in Latin script: AI, Google, Google Business Profile, Justdial, IndiaMART, Zomato, Amazon,
Instagram, WhatsApp (Business), YouTube (Shorts), Reels, Quora, Reddit, Facebook, ChatGPT, Gemini,
Groq, QR, ID, API key, the metric names Coverage / Prominence / Share of voice, the depth options
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
| simulated data | सिम्युलेटेड डेटा | replaces the old "डेमो डेटा" |
| replayed responses | रीप्ले किए गए जवाब | |
| gap | गैप | details view |
| admissible | स्वीकार्य | details view |
| workspace / benchmarks | वर्कस्पेस / बेंचमार्क | home page eyebrows |

## Notes

- The `intent.*` examples in `dashboard.ts` (“best … near me”) stay in English: they quote the
  English question templates the app actually runs.
- Form placeholders for fields that feed those templates (category, audience, customer needs) stay
  in English for the same reason.
