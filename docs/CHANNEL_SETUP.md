# Channel setup: connecting Campaign Studio to real platforms

Campaign Studio works **without any of this**. With no keys set, the **Sandbox** channel simulates
publishing, the **Export pack** gives you a zip of images and copy, and **WhatsApp** opens a
`wa.me` share link. This guide is for connecting real accounts: Facebook Page, Instagram, X and
(later) Google Business Profile. It also covers the image-generation keys and the admin token.

> **Platforms change their consoles often.** Menu names below were correct when this was written.
> Anything marked *(verify in current docs)* is a detail we could not pin down for certain, so check
> it against the platform's own documentation before relying on it.

---

## 0. Where the settings go

1. Put every value in **`.env.local` at the repo root**. It is git-ignored; never commit it. The
   variable names are listed in `.env.example`.
2. Restart the backend after any change (`make dev-backend`, or redeploy on Render).
3. Check the result at `GET http://localhost:8000/channels` (or on the Studio's channel toggles).
   Each channel shows as `connected`, `export_only` (with the reason) or `disabled`.

A blank value (`META_PAGE_ID=`) counts as "not set".

### Admin token and secret key

Approving and publishing to real channels need the `X-Admin-Token` header, so generate both values
once:

```bash
# ADMIN_TOKEN: any long random string; you paste it into the Studio the first time you publish
python -c "import secrets; print(secrets.token_urlsafe(32))"

# SECRET_KEY: a Fernet key (32 random bytes, url-safe base64), used to encrypt stored platform tokens
python -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
```

Use different values locally and on Render. Anyone holding `ADMIN_TOKEN` can post as the brand.

---

## 1. Public image hosting (`PUBLIC_BASE_URL`), needed for Instagram

The Graph API gives Instagram a **URL** for the image, and Instagram's servers download it from
there. `localhost` doesn't work, so the backend has to be reachable from the internet. Generated
images are served at `PUBLIC_BASE_URL/media/<campaign_id>/<file>`.

**On Render:** set `PUBLIC_BASE_URL=https://<your-service>.onrender.com`, with no trailing slash.
There are two things to watch on the free tier:
- The service sleeps after 15 minutes idle. Open the site once before publishing so Instagram's
  download doesn't time out.
- The disk resets on every deploy. Publish soon after you generate the images; see DEPLOY.md.

**Locally, with a Cloudflare quick tunnel** (free, and needs no Cloudflare account):

```bash
# one-time install (Linux x86-64; other builds on the cloudflared GitHub releases page)
mkdir -p ~/.local/bin
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o ~/.local/bin/cloudflared && chmod +x ~/.local/bin/cloudflared

# every session: with the backend running on :8000
cloudflared tunnel --url http://localhost:8000
# → prints something like https://random-words-here.trycloudflare.com
```

Set `PUBLIC_BASE_URL` to the printed `https://…trycloudflare.com` URL and restart the backend. The
URL **changes every time** you start the tunnel, so update it each session.

To test it, open `PUBLIC_BASE_URL/docs` on your phone over mobile data (not your Wi-Fi). If that
page loads, Instagram can reach the backend too.

**The image format matters.** Meta's Content Publishing docs list **JPEG** as the only supported
image format for Instagram feed posts, with an aspect ratio between 4:5 and 1.91:1. The square
(1080×1080) and portrait (1080×1350) outputs are within that range.

---

## 2. Meta: Facebook Page + Instagram

**What you end up with:** `META_PAGE_ID`, `META_PAGE_TOKEN` (a Page access token that doesn't
expire) and `IG_USER_ID`. `META_GRAPH_VERSION` defaults to `v21.0`. Meta retires each Graph API
version about two years after its release, so if requests start failing with a version error, set
it to the current version shown in the Graph API Explorer.

### 2.1 Prerequisites

1. **A Facebook Page** for the brand (for example Gajanan Vada Pav) on which you are an **admin**,
   meaning you have full control of the Page.
2. **An Instagram professional account** (Business or Creator):
   - In the Instagram app, go to Settings → *Account type and tools* → *Switch to professional
     account*.
3. **Link that Instagram account to the Page.** Either:
   - on the Page: Settings → *Linked accounts* → Instagram → Connect, or
   - in Meta Business Suite → Settings → Instagram accounts.

   Posting to Instagram through the API only works for an account linked to a Page.

### 2.2 Create the Meta app

1. Go to <https://developers.facebook.com/> → *Get Started*. Register as a developer with your
   Facebook account; this needs a verified phone number.
2. Go to *My Apps* → *Create App*.
   - The current flow asks for **use cases**. Pick the Pages one ("Manage everything on your
     Page") and the Instagram one ("Manage messaging & content on Instagram").
   - Older flows ask for an **app type**. Pick **Business**.
   - The exact wording changes often *(verify in current docs)*.
3. Leave the app in **Development** mode. In development mode the app can post to Pages and IG
   accounts owned by people who have a **role on the app** (admin, developer or tester), with no app
   review. To add teammates, open *App roles* → *Roles* and add them.
   - App review and Live mode are only needed to post to **other people's** Pages.
   - Some Meta docs say that content an app publishes in development mode is only visible to app
     roles *(verify in current docs)*. If people outside the team can't see a post, switch the app
     to Live. That needs a privacy policy URL in *App settings → Basic*.

### 2.3 Get a short-lived user token with the right permissions

1. Open the **Graph API Explorer**: <https://developers.facebook.com/tools/explorer/>.
2. On the right, select **your app** under *Meta App*, and *User Token* under *User or Page*.
3. Under *Permissions*, add:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `instagram_basic`
   - `instagram_content_publish`
   - `business_management`: only if the Page is owned through a Business portfolio *(verify in
     current docs)*
4. Click **Generate Access Token**. In the Facebook login dialog, choose the brand's **Page and its
   Instagram account** and grant everything.
5. Copy the token. It lasts about 1 hour.

### 2.4 Exchange it for a long-lived token, then get the Page token

Find your **App ID** and **App Secret** under *App settings → Basic* (click *Show* for the secret).

```bash
# 1) short-lived user token → long-lived user token (~60 days)
curl -s "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_LIVED_TOKEN"
# → {"access_token":"EAAB...LONG_USER_TOKEN", "token_type":"bearer", "expires_in":5183...}

# 2) list your Pages with *Page* tokens (derived from a long-lived user token → they don't expire)
curl -s "https://graph.facebook.com/v21.0/me/accounts?access_token=LONG_USER_TOKEN"
# → {"data":[{"name":"Gajanan Vada Pav","id":"1234567890","access_token":"EAAB...PAGE_TOKEN", ...}]}
```

- `id` → **`META_PAGE_ID`**
- `access_token` of that Page → **`META_PAGE_TOKEN`**

Check it in the **Access Token Debugger** (<https://developers.facebook.com/tools/debug/accesstoken/>).
Paste the Page token: *Type* should read **Page** and *Expires* should read **Never**. The token
stops working if you change your Facebook password or remove the app.

Instead of step 1, you can click *Extend Access Token* at the bottom of the debugger. Then run
step 2 with the extended token.

### 2.5 Find the Instagram user id

```bash
curl -s "https://graph.facebook.com/v21.0/META_PAGE_ID?fields=instagram_business_account&access_token=PAGE_TOKEN"
# → {"instagram_business_account":{"id":"17841400000000000"},"id":"1234567890"}
```

The value of `instagram_business_account.id` is **`IG_USER_ID`**. It is **not** your Instagram
username or the number shown in the Instagram app.

### 2.6 Read-only check (posts nothing)

```bash
curl -s "https://graph.facebook.com/v21.0/META_PAGE_ID?fields=name&access_token=PAGE_TOKEN"
curl -s "https://graph.facebook.com/v21.0/IG_USER_ID?fields=username&access_token=PAGE_TOKEN"
# IG publishing quota for the last 24 h (limit is on the order of 100 API posts/day — verify in current docs)
curl -s "https://graph.facebook.com/v21.0/IG_USER_ID/content_publishing_limit?access_token=PAGE_TOKEN"
```

Put the three values in `.env.local`, restart the backend and check `GET /channels`:
- Facebook Page should show `connected`.
- Instagram shows `connected` only once `PUBLIC_BASE_URL` is also set (section 1).

---

## 3. X (Twitter)

**What you end up with:** `X_API_KEY`, `X_API_SECRET` (the app's "consumer" keys) and
`X_ACCESS_TOKEN`, `X_ACCESS_SECRET` (a user token for the account that will post).

Posts go to the X account that **owns the developer account**, so sign up for the developer
account while logged in as the brand's X account. Posting as a different account needs a 3-legged
OAuth "Connect" flow, which comes later.

1. Go to <https://developer.x.com/> and sign in as the brand account.
   - Sign up for the **Free** access level and accept the developer agreement.
   - X has changed its API pricing and limits several times. When this was written, the free level
     allowed a few hundred posts per month with user-context auth (the app's default cap is 500)
     *(verify in current docs)*.
   - Set `X_MONTHLY_POST_LIMIT` to your current allowance.
2. The portal creates a default **Project** and **App**. Open the app.
3. Under **User authentication settings**, click **Set up**. Fill in:
   - **App permissions:** **Read and write**. This is the important one.
   - **Type of App:** *Web App, Automated App or Bot*.
   - **Callback URI / Redirect URL:** `http://localhost:8000/callback`. The form requires one, but
     this app doesn't use it.
   - **Website URL:** the brand's site or your GitHub repo.

   Then save.
4. Go to the **Keys and tokens** tab:
   - Under *Consumer Keys*, **API Key and Secret** → Regenerate. Save them as **`X_API_KEY`** and
     **`X_API_SECRET`**.
   - Under *Authentication Tokens*, **Access Token and Secret** → Generate. Save them as
     **`X_ACCESS_TOKEN`** and **`X_ACCESS_SECRET`**.
   - **Generate the access token only after step 3.** A token keeps the permissions it was created
     with. The portal shows "Created with **Read and Write** permissions" under it. If it says Read
     only, set Read and write first, then **regenerate** the token.
5. Restart the backend. `GET /channels` should show X as `connected` with the posts left this
   month.

**How the app talks to X:**
- It signs requests with OAuth 1.0a (HMAC-SHA1, implemented in
  `backend/src/app/distribution/channels/oauth1.py`).
- Images go to `POST https://api.x.com/2/media/upload`, then the post itself to
  `POST https://api.x.com/2/tweets`.
- The older v1.1 endpoint `upload.twitter.com/1.1/media/upload.json` is being retired, which is
  why the adapter uses v2. If X changes this again, the upload URL is one constant in `x.py`
  *(verify in current docs)*.

**Monthly quota:**
- Successful posts are counted in `DATA_DIR/channels/x_usage.json` (per calendar month, UTC).
- When the count reaches `X_MONTHLY_POST_LIMIT`, the adapter refuses to post until the 1st.
- The counter only sees posts made **through this app**. Posts you make by hand in the X app don't
  use API quota, so the two numbers can legitimately differ.

---

## 4. Google Business Profile (GBP)

GBP posts are the best channel for **local AI answers**: Google and the assistants that read it see
fresh, crawlable text about the business. API access, however, is **not self-serve**. Google has to
approve your Cloud project first. Until then the channel shows *"Needs Google Business Profile API
access"* and campaigns export a GBP post (text plus a 1200×900 image) that you paste by hand at
<https://business.google.com/> → your profile → **Add update**.

### 4.1 Apply for API access (do this early: approval takes days to weeks)

1. You need a **verified** Business Profile that you own or manage.
   - Google has asked for a profile that has been verified and active for some time (60+ days has
     been mentioned).
   - Your email should match the business's website domain where possible *(verify in current
     docs)*.
2. Create a project at <https://console.cloud.google.com/> (for example `brandviz-gbp`). Note the
   **project number** shown on the dashboard.
3. Open the Business Profile APIs **Prerequisites** page:
   <https://developers.google.com/my-business/content/prereqs>.
   - Follow its link to the **access request form** and choose **"Application for Basic API
     Access"**.
   - Give the project number and describe the use honestly: "posting updates to our own
     business's profile".
4. **Check whether you've been approved:** in Cloud Console, open *APIs & Services → Enabled APIs*
   → *My Business Account Management API* → **Quotas**.
   - Requests per minute = **0** means not approved yet.
   - A non-zero value (for example 300) means approved *(verify in current docs)*.

### 4.2 Once approved: enable APIs and set up OAuth

1. Under *APIs & Services → Library*, enable:
   - **My Business Account Management API** (for account ids)
   - **My Business Business Information API** (for location ids)
   - **Google My Business API**, the v4 API that still hosts `localPosts` *(verify in current
     docs; it may be listed only after approval)*
2. Set up the **OAuth consent screen** (*Google Auth Platform → Branding / Audience*):
   - User type: **External**.
   - Publishing status: **Testing**.
   - Add your own Google account as a **test user**.
3. Create credentials: **OAuth client ID** → type **Web application**. Add this authorized redirect
   URI: `https://developers.google.com/oauthplayground`.
4. Open the **OAuth 2.0 Playground** (<https://developers.google.com/oauthplayground>):
   - Click the gear icon and tick *Use your own OAuth credentials*. Paste your client ID and secret.
   - In the scope box, type `https://www.googleapis.com/auth/business.manage` and click
     **Authorize APIs**. Sign in with the profile's owner or manager account.
   - Click **Exchange authorization code for tokens**.
   - Copy the **Access token** → **`GBP_ACCESS_TOKEN`**. It lasts about **1 hour**.
   - Also keep the **refresh token** somewhere safe; the planned "Connect" flow will use it.

### 4.3 Find the account and location ids

```bash
TOKEN=ya29....   # the access token from the Playground

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
# → {"accounts":[{"name":"accounts/112233445566778899", ...}]}

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/112233445566778899/locations?readMask=name,title"
# → {"locations":[{"name":"locations/998877665544332211","title":"V.A. Mayekar Opticians"}]}
```

- **`GBP_ACCOUNT_ID`** = `112233445566778899`
- **`GBP_LOCATION_ID`** = `998877665544332211`

You can paste either the bare numbers or the full `accounts/…` and `locations/…` names; the adapter
accepts both.

**What gets posted:**
- The adapter creates a `STANDARD` local post.
- The summary is the copy, limited to 1,500 characters.
- The image is sent as a `PHOTO` by public URL, so this also needs `PUBLIC_BASE_URL`.
- The link becomes a **Learn more** button.
- Google moderates posts. A post with a phone number in the text, or one that looks like spam, can
  come back `REJECTED`. The adapter reports that as a failure.

---

## 5. Image generation keys

Images come from the providers in `IMAGE_PROVIDERS` (default `gemini,cloudflare,template`), tried
in that order.
- `template` is offline and always works, so you can skip this whole section for demos.
- Models never draw the brand text. The compositor overlays the brand name and CTA afterwards,
  including Devanagari.

### Gemini (image model)

- It uses the existing **`GEMINI_API_KEY`** (from <https://aistudio.google.com/apikey>). The model
  is `GEMINI_IMAGE_MODEL`.
- Image-output models often have **little or no free-tier quota**. Check your limits at
  <https://aistudio.google.com/> → *Usage & limits* / rate-limit docs *(verify in current docs)*.
- A quota error (HTTP 429) is harmless: the chain falls through to Cloudflare, then to the template.

### Cloudflare Workers AI (FLUX schnell)

1. Sign up at <https://dash.cloudflare.com/>. The free plan is fine.
2. Get the **Account ID**, which becomes **`CLOUDFLARE_ACCOUNT_ID`**. You can find it in either of
   these places:
   - on the *Workers & Pages* overview (right-hand side, "Account ID")
   - in the dashboard URL: `dash.cloudflare.com/<account_id>/…`
3. Create the **API token**, which becomes **`CLOUDFLARE_API_TOKEN`**:
   - Go to *My Profile → API Tokens → Create Token*.
   - Use the **Workers AI** template. It grants *Account → Workers AI*; keep it scoped to your
     account.
   - Create the token and copy it (it's shown once).
4. Test it:

   ```bash
   curl -s https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/black-forest-labs/flux-1-schnell \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -d '{"prompt":"a bottle of attar on a marble table, soft light"}' | head -c 200
   ```

   The response is JSON with a base64 `image` field. The free allocation is a daily "neurons" budget
   (on the order of 10,000/day), which is enough for dozens of images *(verify in current docs)*.

---

## 6. Troubleshooting

| Symptom / error | Likely cause | Fix |
|---|---|---|
| Channel shows `export_only` although you set the keys | Backend not restarted, the value is in the wrong file, or it has a typo | Put it in the repo-root `.env.local`, restart, then re-check `GET /channels` (the detail names the missing variable). |
| Instagram: "needs PUBLIC_BASE_URL (public image hosting)" | `PUBLIC_BASE_URL` is unset or points at localhost | Set it to the Render URL or the `trycloudflare.com` URL (section 1). |
| Graph API error **190** | Page token expired or revoked (password change, app removed, or a short-lived token was used) | Redo 2.3–2.4 and use the **Page** token from `/me/accounts`. The debugger must say "Expires: Never". |
| Graph API error **10** / **200**–**299** | A permission is missing from the token | Regenerate with every permission in 2.3, then redo 2.4. |
| Graph API error **4 / 17 / 32 / 613** | Rate limited | Wait, then retry. |
| Instagram error **9004** / "Media download has failed" | Instagram couldn't fetch the image: the tunnel is down, Render is asleep, the URL isn't public, or the image isn't JPEG | Open the image URL from mobile data. Wake Render. Make sure a `.jpg` is served. |
| Instagram "container ERROR" / aspect-ratio error | Image outside 4:5 to 1.91:1, or wrong format | Use the square or portrait asset (JPEG). |
| Instagram "still processing after N checks" | Meta is slow to process the image | Nothing was posted, so just retry. |
| IG post works for you but teammates can't see it | App in Development mode *(verify in current docs)* | Add them to *App roles*, or switch the app to Live. |
| X **401** | Wrong or mismatched keys, or an extra space pasted into `.env.local` | Re-copy all four values. |
| X **403** "not permitted" | Access token created while the app was Read-only, or a duplicate post | Set **Read and write**, **regenerate** the access token and secret; if it's a duplicate, change the text. |
| X **429** / "monthly post limit reached" | X's rate limit or your `X_MONTHLY_POST_LIMIT` | Wait (the monthly count resets on the 1st, UTC) or raise the limit if your tier allows. |
| X post too long, though it looks short | X counts every link as 23 characters, and emoji or CJK characters as 2 | Shorten the text or remove hashtags; the Studio counter uses X's rules. |
| GBP **403** "API has not been used" / **429** with quota 0 | API access not approved yet, or the API isn't enabled | Section 4.1 (wait for approval), then 4.2 step 1. |
| GBP **401** | Access token expired (they last about an hour) | Get a fresh one from the OAuth Playground (4.2 step 4). |
| GBP post "REJECTED" | Google content policy (phone numbers, spammy text) | Edit the copy and publish again. |
| Gemini image 429 / quota | No free image quota | Nothing to fix: it falls back to Cloudflare or the template. Or set `IMAGE_PROVIDERS=cloudflare,template`. |
| Cloudflare 401/403 | Token missing the Workers AI permission, or the account ID is wrong | Recreate the token from the Workers AI template and check the ID in the dashboard URL. |
| Publish button asks for a token | `ADMIN_TOKEN` set on the server | Paste the same `ADMIN_TOKEN` value you put in `.env.local`. |
