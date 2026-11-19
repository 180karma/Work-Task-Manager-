# Invoice Scraper

A single-file browser invoice scraper.

Open `invoice_scraper.html` locally in Chrome, Edge, or Safari. PDF rendering uses PDF.js from cdnjs. No build step.

Drop in supplier invoices (PDF or image) to extract line items, header fields, and CSV.

## Shared kitchen library

The page connects with the project's anon key, then asks for a **username and password**. There is no email sign-in. The admin username is Admin.

- Run `supabase-schema.sql` once in the Supabase SQL editor (safe to re-run). Run it again if an admin delete of a logo is refused: the file ends with the `admin delete supplier logos` policy.
- Signed-in people see the same library and can add invoices. The admin can also change and delete records, and add or remove usernames under Settings → Staff.
- Settings → Admin deletes one kind of data at a time (one invoice and its lines, all invoices, line items, one supplier and its invoices, lines, layout and logo, all suppliers, contacts, price history, one or all layouts, one or all logos, or everything). The confirm step names what will be removed. A delete is written here and in Supabase, and the next sync does not bring it back.
- Optional `ADMIN_EMAILS` (comma-separated sign-in emails) is read like the Supabase URL: repository variable on Pages, or `.env` locally, then `node scripts/make-config.mjs`. The Admin username’s sign-in email is `admin@users.invoice.local`. If the variable is empty, every staff account with the admin role can delete. The address is not written into the page by hand.
- If the admin username is gone, the sign-in page can email a magic link. The link returns to `https://180karma.github.io/Invoice_scraper/`. Supabase Site URL must be that address, and Redirect URLs must include `https://180karma.github.io/Invoice_scraper/**`, or the email opens localhost. A refused sign-in keeps the Supabase sentence after “Supabase said:”. Run the `claim_kitchen_admin` block at the end of `supabase-schema.sql` again if a username-only admin row is still blocking a real inbox. Settings → Staff will not remove the last sign-in, and Delete everything does not remove staff.

## Keys

- **Supabase URL and anon/publishable key** come from `config.js`, which is generated, never committed.
  - On GitHub Pages, `.github/workflows/pages.yml` writes it from the repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Pages must be set to deploy from GitHub Actions.
  - Locally: copy `.env.example` to `.env`, fill it in, run `node scripts/make-config.mjs`, then serve the folder (for example `python3 -m http.server`).
  - The kitchen project's anon key is also built into `invoice_scraper.html`, so any copy of the page (Pages, a downloaded file, any device) connects and syncs without setup. Settings no longer asks for a key.
  - The script refuses service_role and secret keys. The anon/publishable key is public by design; row-level security protects the data.
- **Gemini key** never goes to the browser. Scans go through the Supabase Edge Function `supabase/functions/gemini-extract`, which reads `GEMINI_API_KEY` from the Supabase project secrets and only answers signed-in users. Every scan uses Gemini 3.8 Flash (`gemini-3.8-flash`). There is no model picker and no key field on the page.
  - `.github/workflows/gemini-function.yml` deploys it and stores the secret, using the repository secrets `SUPABASE_ACCESS_TOKEN` and `GEMINI_API_KEY`. Optional `GEMINI_ALLOWED_EMAILS` (comma-separated) limits scanning to those accounts.
- **Supplier logos** are image files in the private Storage bucket `supplier-logos`, at `{supplier id}.jpg` (the ABN when there is one, otherwise the normalised name with spaces as hyphens). Signed-in staff load them with their session. The bucket does not need to be public. The SQL at the end of `supabase-schema.sql` creates the bucket and the staff policies.
