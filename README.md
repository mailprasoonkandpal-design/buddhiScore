# Buddhi Score: launch guide for buddhiscore.in

Everything inside the `site` folder is the website. Do not upload this README.

## What is in `site`

| File | What it is |
|---|---|
| `index.html` | The whole test, report and share pages |
| `_worker.js` | Server code: creates the Razorpay order and confirms payment |
| `terms.html`, `privacy.html`, `refund.html`, `contact.html` | Policy pages |

## Step 1. Fill in your details (5 minutes)

Open `terms.html`, `privacy.html` and `contact.html` in any text editor and replace these markers everywhere they appear:

| Marker | Replace with |
|---|---|
| `OWNER_FULL_NAME` | Your full legal name, as on your PAN |
| `OWNER_CITY` | Your city |
| `OWNER_ADDRESS` | A postal address you are comfortable publishing |
| `SUPPORT_EMAIL` | A support email address (a new one made for this is best) |
| `SUPPORT_PHONE` | A phone number for support |

These pages are drafts written to match how the site works. Have a lawyer or CA read them once before you take real payments.

## Step 2. Razorpay account

1. Sign up at razorpay.com and choose **Unregistered > Individual**.
2. Complete KYC with your PAN and savings account.
3. In the dashboard, switch to **Test mode** and go to **Account & Settings > API Keys > Generate key**.
4. Copy the **Key ID** (starts `rzp_test_`) and the **Key Secret**. The secret is shown only once.

## Step 3. Put the site on Cloudflare

1. Create a free account at cloudflare.com.
2. Go to **Workers & Pages > Create application > Pages > Upload assets**.
3. Name the project `buddhiscore` and drag in the `site` folder. Deploy.
4. You get an address like `buddhiscore.pages.dev`. Open it and check the test works.

## Step 4. Add the payment keys

1. In the Pages project: **Settings > Variables and Secrets > Add**.
2. Add two entries of type **Secret**, for the Production environment:
   - `RAZORPAY_KEY_ID` = your Key ID
   - `RAZORPAY_KEY_SECRET` = your Key Secret
3. Optional: `PRICE_PAISE` (plain text). `4900` means ₹49. Change it to test other prices.
4. Upload the `site` folder again (**Deployments > Create deployment**). New secrets only apply to new deployments.

## Step 5. Test a payment

1. Take the test on your `pages.dev` address and tap **Unlock full report for ₹49**.
2. With test keys, Razorpay shows a test checkout. Use the test UPI ID `success@razorpay`, or a test card from Razorpay's documentation.
3. The full report should open. Reload the page and tap **Open my report**: it should still be unlocked.
4. Try closing the checkout without paying: nothing should unlock.

## Step 6. Connect buddhiscore.in

1. In the Pages project: **Custom domains > Set up a domain > buddhiscore.in**.
2. Cloudflare shows you what to change at your domain registrar. The simplest route is to switch the domain's nameservers to Cloudflare's, as it instructs.
3. Wait for the domain to show **Active** (minutes to a few hours).

## Step 7. Go live

1. In Razorpay, add `https://buddhiscore.in` as your website and finish activation.
2. Generate **Live** keys (they start `rzp_live_`).
3. Replace the two secrets in Cloudflare with the live values and upload `site` once more.
4. Make one real ₹49 payment yourself, confirm the report opens, then refund it from the Razorpay dashboard.

## Whimsi, the AI chat

Every paid report includes an AI-powered chat about the report: up to 20 messages with Whimsi, an AI thinking buddy powered by Claude Haiku 5.5. Whimsi explains the person's results and gives practice puzzles with hints, and it uses simpler, child-safe language for ages 6 to 12. Its instructions are in `whimsi.js`.

1. In the Claude Console (platform.claude.com), create an API key and add some billing credit.
2. In the Worker's **Settings > Variables and Secrets**, add a **Secret** named `ANTHROPIC_API_KEY` with that key.
3. Run `npm install` once, then deploy with `npx wrangler deploy`. The deploy bundles the Anthropic SDK and creates the `WHIMSI` KV namespace that counts messages.

Costs and limits:
- Roughly $0.001 per message, so a full 20-message chat costs about 2 US cents.
- Chats are not stored on the server. Only a message count per order is kept, for 180 days.
- The free Workers plan allows 1,000 KV writes a day, about 1,000 Whimsi messages a day. Move to Workers Paid before you outgrow it.

## Test on your computer

Run `npm install`, then `npx wrangler dev -c wrangler.local.jsonc` and open http://127.0.0.1:8787. In this test mode payments are fake (a "pretend to pay" box). Whimsi sends canned replies unless `.dev.vars` has a real `ANTHROPIC_API_KEY`, in which case it talks to Claude. Never deploy with `wrangler.local.jsonc`.

## Good to know

- **No database.** Reports are saved in the visitor's own browser. A buyer who clears their browser data or changes phone loses the report. If they write to you with a payment ID, check it in Razorpay and refund or ask them to retake.
- **How secure is the unlock?** Payment is confirmed by your server with Razorpay before the report opens, so ordinary users cannot skip paying. The report itself is built in the browser, so a skilled programmer could still dig it out. At ₹49 this is an accepted trade-off; closing it needs the report to be generated on the server.
- **Refunds** are done from the Razorpay dashboard: open the payment and choose Refund.
- **To change the price shown on the page**, search `index.html` for `₹49` and update the text, and set `PRICE_PAISE` to match.
- **Sharing links** look like `https://buddhiscore.in/#r-3-112-...` and contain the first name and scores.
