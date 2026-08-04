# Form catalog

Every template lives in `assets/templates/`. All .docx files are the official
PropNex forms (downloaded from the Agent Suite portal, current as of Aug 2026)
and are filled in place with `scripts/fill_form.py` — original layout, logo,
footers and version codes are preserved.

Quick index by scenario:

| The deal stage | Likely form(s) |
|---|---|
| Tenant wants to make an offer on a rental | LOI (Residential / NonResidential) |
| Offer accepted, drafting the lease | TA_Private_Condo / TA_Landed / TA_HDB_Approved_Unit / TA_NonResidential / TA_Retail_QLR |
| Renting out room(s) only, not the whole unit | Room_Rental_Agreement |
| Existing lease expiring, same terms | Lease_Extension_Residential |
| Tenant handing over lease to a new tenant | Assignment_PTE / Assignment_HDB |
| Getting the client to sign your commission terms | CEA Forms 1–8 (pick by side + exclusivity) |
| Splitting commission with another agent | CoBroke_* / Commission_Sharing_Same_Party |
| Seller granting a buyer an option | OTP_Residential / OTP_HDB_Shop / OTP_IndCom |
| HDB resale sellers staying on after completion | HDB_Temp_Extension_of_Stay |
| Handover condition record | Inventory_List.xlsx |
| Mandatory AML/CDD before any agreement | AML_FormA1_Individual.pdf + AML_FormB_Risk.pdf |

---

## Residential leasing (the most common flow)

**LOI_Residential_v2.docx — Letter of Intent (Residential), LEG-AG-09-08 v2 (17/06/25)**
Tenant's written offer to the landlord, signed before the TA. Needs: date,
landlord name/NRIC/address, tenant name + passport or FIN, property address,
term + commencement, monthly rent, security deposit, good faith deposit +
cheque no., special requirements, commission (fill only the paying side),
renewal/diplomatic clause (strike if none — typical for 12-month leases).
Tenant ID tip: if the tenant holds an IPA / Student's Pass / Work Pass, use
the FIN everywhere, not the passport number.

**TA_Private_Condo.docx / TA_Landed.docx / TA_HDB_Approved_Unit.docx —
Tenancy Agreements.** Pick strictly by property type; the three are near-twins.
Needs: date, both parties' name/NRIC/address, premises, term, commencement,
rent + payment day, landlord bank account, security deposit, defect-free
period (days), minor-repair cap (usually S$150–200, appears 4× in two
clauses), replacement cap (4×), plus per-version extras (aircon servicing
frequency, diplomatic clause months, option to renew). The HDB version adds
HDB approval/registration conditions. Long forms (~48 blanks) — walk clause
by clause against the `list` output; don't guess a blank's meaning from its
index alone.

**Room_Rental_Agreement.docx** — letting out room(s) while the unit stays
occupied. Shorter TA variant; needs number of rooms and which room, and the
same money/term fields. Brokered-through-PropNex wording is pre-printed.

**Lease_Extension_Residential.docx — Lease Renewal/Extension.** Only valid
when renewing on the same terms as the original TA. Short (~55 paragraphs).
Needs: date, landlord(s), tenant(s) with NRIC/passport/UEN, premises,
original TA date, extension months + start/end, new rent, deposit ("remain
at" or "changed to" — strike the wrong words), then two choose-1 blocks:
diplomatic clause (3 options) and option-to-renew (2 options) — strike the
unchosen paragraphs entirely.

**Service_Fee_Agreement.docx** — landlord confirms the agent performed the
immigration due-diligence checks on the tenants and agrees the service fee.
Tiny form: property, lease date, tenant names + IDs, fee.

**Assignment_PTE.docx / Assignment_HDB.docx** — novation of an existing
tenancy from the Present Tenant to a New Tenant (takeover), with landlord's
consent. Needs both tenants' particulars, landlord, property, original TA
date, assignment date.

**HDB_Temp_Extension_of_Stay.docx** — private agreement for HDB resale
sellers to stay up to 3 months after completion. Sellers'/buyers' names (table
rows — use `appends`), flat address, completion date, extension terms.

## CEA prescribed estate agency agreements (commission forms)

Every represented client signs one. Prescribed under the Estate Agents Act —
do not reword clauses; only fill particulars. PropNex Realty Pte Ltd, licence
no. and agreement wording are pre-printed.

| Form | Client | Exclusive? |
|---|---|---|
| CEA_Form1_Sale | Seller | No |
| CEA_Form5_Excl_Sale | Seller | Yes |
| CEA_Form2_Purchase | Buyer | No |
| CEA_Form6_Excl_Purchase | Buyer | Yes |
| CEA_Form3_Lease_Landlord | Landlord | No |
| CEA_Form7_Excl_Lease_Landlord | Landlord | Yes |
| CEA_Form4_Lease_Tenant | Tenant | No |
| CEA_Form8_Excl_Lease_Tenant | Tenant | Yes |

Needs: agreement date, client particulars (up to 4 co-owners), salesperson
name + CEA reg no., property, commission rate/amount + GST, and for exclusive
forms a validity period (CEA caps exclusivity at 3 months). Filling quirks:
many fields are label-only table cells ("Landlord (1) Name:") — use
`appends`, not `fills`. Short values (a name, an NRIC) can be appended to the
label paragraph itself, but longer values (addresses) must go into the
**empty paragraph right after the label** (the wide value cell — `list` mode
shows these as `[empty]`), or the text gets squeezed into the narrow label
column. The date slots look like ` / / (dd/mm/yyyy)` — use `replaces`. If both landlord and tenant sides ask you for a commission form
in the same deal, flag the double-commission prohibition.

## Sale side

**OTP_Residential.docx — Option to Purchase (private residential).** The big
one on the sale side (~42 blanks): vendor/purchaser particulars, property,
purchase price, option fee (typically 1%), option period, exercise deadline &
option-exercise fee (typically 4%), completion period, and solicitor details.
Serious money document — after filling, insist the user checks every figure.

**OTP_HDB_Shop.docx / OTP_IndCom.docx** — HDB shop and industrial/commercial
variants of the OTP.

## Agent-to-agent forms

**CoBroke_Lease_Tenant.docx** — you represent the tenant and collect a
co-broke share from the landlord's agent. **CoBroke_SnP_Purchaser.docx** —
same idea on the purchase side. Both have an Internal/External co-broke
selector (strike the inapplicable), the other agency's name/address, property,
deal, split amount.

**Commission_Sharing_Same_Party.docx** — two or more salespersons represent
the *same* client and share that client's commission. Internal/External
selector, property, client, each salesperson's share.

## Non-residential leasing

**LOI_NonResidential.docx** — offices, industrial. NOT for retail premises
with a lease ≥1 year covered by the Code of Conduct for Leasing of Retail
Premises — the portal has a separate "LOI (Qualifying Lease-Retail Premises)"
form not bundled here; tell the user to fetch it from Agent Suite for that
case. **TA_NonResidential.docx** and **TA_Retail_QLR.docx** are the matching
tenancy agreements (the QLR one is Code-compliant for retail).

## Not docx — different handling

**Inventory_List.xlsx** — handover inventory. Edit as a spreadsheet (openpyxl
or an xlsx skill), one row per item/room, quantities and condition.

**AML_FormA1_Individual.pdf + AML_FormB_Risk.pdf** — the Feb-2026 AML/CDD
forms (customer particulars + risk screening). PropNex requires an AML check
before entering into ANY agreement — mention this whenever you produce an
agreement. These are PDFs: fill via a PDF tool if available, else deliver
with a summary of what to write in. The portal has the full series (A1–A4, B,
C, D, U1–U6) for entities and unrepresented counterparties — only the two
everyday ones are bundled.
