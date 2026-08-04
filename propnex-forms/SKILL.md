---
name: propnex-forms
description: >
  Fill any official PropNex transaction form for a Singapore property deal and
  deliver it as a signing-ready document — tenancy agreements (condo / landed /
  HDB / room / non-residential), Letters of Intent, lease renewals, CEA estate
  agency agreements (Forms 1–8), Options to Purchase, co-broke and
  commission-sharing agreements, assignments, inventory list and AML forms.
  Use this skill whenever a property agent wants any transaction document
  drafted, filled, or updated, OR uploads deal materials — a passport, an SLA /
  INLIS title search, an ICA IPA / Student's Pass letter, a signed LOI, an old
  tenancy agreement, or WhatsApp screenshots of deal terms — even if they never
  name a form. Also use it to figure out WHICH form a deal needs ("tenant wants
  to extend", "I'm co-broking this one", "seller accepted the offer, what do I
  prepare?"). All 31 official templates are bundled; no internet needed.
---

# PropNex transaction forms drafter

Bundled in `assets/templates/` are the official PropNex forms (as at Aug 2026).
They are plain Word documents with underscore blanks; `scripts/fill_form.py`
fills them **in place**, so the output keeps the official logo, layout,
footers and version codes — it looks exactly like a hand-completed original.

Respond in the language the user writes in. The users are licensed Singapore
agents: be efficient and use industry terms (LOI, TA, co-broke, GFD) freely.

## Workflow

### 1. Read the materials first

Whatever arrives — passport photos, SLA/INLIS title searches, IPA letters,
signed LOIs, expiring TAs, WhatsApp screenshots — extract the facts before
asking anything. Typical mappings:

- **SLA / INLIS title search** → landlord/vendor name, ID, citizenship,
  address; property address. The proprietor's correspondence address is often
  a *different unit* from the one being transacted — don't conflate them.
  A foreign proprietor's ID is a FIN/foreign ID, not an NRIC.
- **Passport** → tenant/buyer name (as printed, surname first), nationality,
  passport no. If they also hold an IPA / Student's Pass / Work Pass, prefer
  the **FIN** on every form.
- **ICA IPA / pass letter** → FIN, pass type (drives immigration clauses).
- **A signed LOI or expiring TA** → nearly every field for the follow-on
  document (TA after LOI, renewal after TA). Reuse aggressively.
- **Agent profile / namecard** → salesperson name, CEA reg no.

### 2. Work out which form they need

If the user names the form, go straight there. Otherwise infer from the deal
stage and materials, read `references/catalog.md` (the scenario table at the
top is built for this), and offer **2–4 candidates** — each described in one
plain sentence of "sign this when…" — and let the user pick. Use the
AskUserQuestion tool when available, otherwise a short numbered list. Don't
present all 31 forms; that's noise. One deal often needs a pair — e.g. a TA
plus the CEA commission form for your side, or an OTP plus Form 1 — suggest
the companion form when it's obviously next.

### 3. Gather what's missing — in one pass

Read the catalog entry for the chosen form, then run:

```bash
python3 scripts/fill_form.py list assets/templates/<Form>.docx
```

Map the facts you already have onto the blanks, then show the user a short
two-part checklist: **already have** (so they can spot extraction errors) and
**still need**. Ask for all the gaps in a single message. Offer market
defaults where they exist (1-month deposit per year of lease, half-month
commission, GST 9%, S$150–200 minor-repair cap, option fee 1% / exercise fee
4%) — as suggestions to confirm, never silent assumptions.

Never invent a value. Anything the user can't provide stays an underscore
blank for hand-filling at signing — and say so in the recap.

### 4. Fill

Write a spec JSON and run:

```bash
python3 scripts/fill_form.py fill assets/templates/<Form>.docx spec.json out.docx
```

Spec operations (full syntax in the script's docstring):
- `fills` — put text into blank *k* of paragraph *p*; renders underlined.
- `appends` — for label-only lines/table cells (CEA forms' "Landlord (1)
  Name:" rows have no underscores).
- `strikes` / `strike_texts` — for "delete whichever is inapplicable" and
  choose-1 clause blocks (renewal options, diplomatic clause, Internal/
  External co-broke). Strike the rejected option; leave the chosen one.
- `replaces` — for non-underscore slots like ` / / (dd/mm/yyyy)` dates.

Conventions: dates usually split across multiple blanks (day / month / year —
check the surrounding text); money as `4,500.00` (the S$ is pre-printed);
names in CAPS as on the ID document.

### 5. Convert, check, deliver

Convert to PDF with whatever the machine has:

```bash
soffice --headless --convert-to pdf out.docx          # LibreOffice
# macOS without LibreOffice — use Pages:
osascript -e 'tell application "Pages"
  set d to open POSIX file "/absolute/path/out.docx"
  export d to POSIX file "/absolute/path/out.pdf" as PDF
  close d saving no
end tell'
```

If neither works, deliver the .docx and say the user can print to PDF from
Word. (Pages misplaces a floating header text box on some CEA forms — that
artifact is in the template import, not your fill; the .docx is authoritative
and prints correctly from Word. Prefer LibreOffice when both exist.) **Always view the PDF (or rendered pages) before presenting**: check
each value landed in the right blank, nothing overflowed its line, and the
strikethroughs hit the right clause. A value in the wrong blank of a legal
document is worse than a blank.

Deliver the PDF + the filled .docx, with a recap of: what was filled, what
was left blank for signing, what was struck out, and the relevant compliance
flags. Keep the spec JSON — revisions ("change the rent to 4,800") are a
one-line edit and a re-run against the *original* template.

## Compliance flags to surface (briefly, when relevant)

- **AML/CDD first**: PropNex requires an AML check before entering into any
  agreement — Form A1 + Form B are bundled in the templates folder.
- **Double commission**: a salesperson cannot collect commission from both
  sides of the same transaction. Fill only the paying side's commission.
- **CEA prescribed forms (1–8)**: don't reword clauses — particulars only.
  Exclusive agreements max 3 months.
- **URA residential rules**: minimum 3-month rental; occupancy cap (6 for a
  private home). Extra occupants need valid passes.
- **Retail leases ≥1 year**: use the Qualifying-Lease (QLR) documents, not
  the ordinary non-residential ones (see catalog).
- These forms carry NRIC/passport data — keep files local, and remind the
  user of PDPA handling if they ask to send documents anywhere.

This skill drafts working documents for licensed agents; it is not legal
advice, and the forms' own disclaimers stand.

## Templates that aren't fillable .docx

- `Inventory_List.xlsx` — edit as a spreadsheet (one row per item, per room).
- `AML_FormA1_Individual.pdf`, `AML_FormB_Risk.pdf` — fill with a PDF tool if
  available; otherwise deliver alongside a summary of what to enter.

Templates update occasionally — agents can re-download any form from
Agent Suite → Forms & Submission → Transaction Forms and drop it into
`assets/templates/` under the same name.
