# Carolina Recharge — Brand Guidelines

> **Purpose:** This document is the single source of truth for all Carolina Recharge visual and voice decisions. Reference it when building new pages, writing copy, creating assets, or onboarding contributors to the website or any branded material.

> ⚠️ **Read [Section 5: Language Rules](#5-language-rules--compliance-critical) before writing or editing any copy.** Some of the language in earlier versions of this site created regulatory exposure and made claims that are no longer true. Section 5 states exactly what may and may not be said, and why. It is not stylistic guidance.

---

## Table of Contents

1. [Brand Identity](#1-brand-identity)
2. [Logo](#2-logo)
3. [Color Palette](#3-color-palette)
4. [Typography](#4-typography)
5. [Language Rules — Compliance Critical](#5-language-rules--compliance-critical)
6. [Required Disclosures](#6-required-disclosures)
7. [Voice & Messaging](#7-voice--messaging)
8. [Service Ladder](#8-service-ladder)
9. [UI Patterns](#9-ui-patterns)
10. [File Structure](#10-file-structure)

---

## 1. Brand Identity

| | |
|---|---|
| **Company** | Carolina Recharge LLC |
| **Tagline** | Powering Carolina's Electric Future |
| **Headline** | Know before you build. |
| **Positioning** | Local NC partner serving mid-market properties in the Triad region (Winston-Salem, Greensboro, High Point) with EV charging assessment, competitive electrical bid management, equipment supply, and ongoing support |
| **Personality** | Technical & precise · Forward-thinking · Carolina-proud |

### What The Business Actually Does

Five things, in this order:

1. Determine what a property's existing electrical service can actually support.
2. Recommend a charging configuration built around that constraint.
3. Run a competitive bid process for the electrical work.
4. Supply charging hardware and management software **as an authorized reseller**.
5. Support that equipment after it is switched on.

### The Core Technical Proposition

The dominant project cost is electrical infrastructure, not hardware — and specifically whether the job triggers a **service upgrade**, which adds **$20,000–100,000** and usually triggers sealed drawings. Load management under **NEC 625.42** often lets a property add far more charging positions inside existing capacity. **That analysis is the product.** Copy should keep returning to it.

### Who We Serve
Primary customers are property managers and owners of **multifamily apartment communities** and **Class B office buildings** in the NC Triad. They need technical precision they can trust and a local partner who understands their market — not a national call center.

**Highest-intent segment:** properties that *already* have chargers which are failing, offline, or orphaned on a lapsed network account. The "takeover" angle earns its place on the site.

---

## 2. Logo

### Files
| File | Use |
|---|---|
| `images/logo-horizontal.svg` | Website header, footer, letterhead, email signatures, horizontal layouts |
| `images/logo-stacked.svg` | Square formats, social media profile images |

### Construction
The logo has two components:

**Icon** — A precise outline of North Carolina (sourced from US Census Bureau boundary data) rendered in Electric Blue, with a filled circle node marking the Triad region (Winston-Salem at approximately 80.24°W, 36.10°N).

**Wordmark** — `CAROLINA` in Electric Blue · `RECHARGE` in Deep Navy · Font: Montserrat ExtraBold 800 · All caps · Letter-spacing: 1px

### Clear Space
Maintain clear space equal to the cap-height of the `C` in `CAROLINA` on all four sides of the logo. Never crowd it against other elements.

### Minimum Size
- **Screen:** 150px wide minimum
- **Print:** 1.5 inches wide minimum

### What Not To Do
- Do not recolor the logo
- Do not stretch or distort the NC outline
- **Do not modify the SVG path data or the `viewBox`** — the outline is real boundary data
- Do not place the logo on low-contrast backgrounds
- Do not use drop shadows or effects on the logo
- Do not rearrange the icon and wordmark

---

## 3. Color Palette

### Primary Colors

| Name | Hex | RGB | Use |
|---|---|---|---|
| **Electric Blue** | `#0A7AFF` | 10, 122, 255 | Logo, headlines, CTAs, links, energy graphics, primary brand color |
| **Deep Navy** | `#1E3A8A` | 30, 58, 138 | Body text, section headers, professional documents, wordmark |
| **Pure White** | `#FFFFFF` | 255, 255, 255 | Page backgrounds, button labels, contrast areas |
| **Cloud White** | `#F8FAFC` | 248, 250, 252 | Alternating section backgrounds, cards, subtle section dividers |

### Accent Colors

| Name | Hex | Use |
|---|---|---|
| **Slate Gray** | `#64748B` | Secondary text, captions, borders, metadata |
| **Energy Green** | `#10B981` | Success states, eco/sustainability messaging only |
| **Charge Orange** | `#F59E0B` | Sparingly — alerts, energy callouts. Never as a primary color. |

### Implementation Note
`styles.css` also defines `--navy-dark: #0F2060` for full-bleed dark sections (hero, positioning, CTA) and `--grid-line` for the blueprint grid overlay. These are implementation tokens derived from the palette, not new brand colors.

### Color Ratio
> **60%** Electric Blue · **30%** Deep Navy · **10%** White & Accents

### CSS Variables
Use these variables throughout all stylesheets. Do not hardcode hex values inline.

```css
:root {
  --color-electric-blue:  #0A7AFF;
  --color-deep-navy:      #1E3A8A;
  --color-white:          #FFFFFF;
  --color-cloud-white:    #F8FAFC;
  --color-slate-gray:     #64748B;
  --color-energy-green:   #10B981;
  --color-charge-orange:  #F59E0B;
}
```

---

## 4. Typography

### Fonts
- **Primary:** [Montserrat](https://fonts.google.com/specimen/Montserrat) (Google Fonts, free) — headings, logo, and body
- **Fallback stack:** Inter → Arial → sans-serif

### Google Fonts Import
Add to the `<head>` of every page:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
```

### Type Scale

| Element | Specs | Usage |
|---|---|---|
| **H1** | Montserrat Bold 800 · `clamp(44px, 5.5vw, 80px)` · uppercase | Hero headlines |
| **H2** | Montserrat Bold 800 · `clamp(32px, 3.5vw, 52px)` · uppercase · Deep Navy | Section headers (`.section-title`) |
| **H3** | Montserrat SemiBold 700 · 15–20px · uppercase · Deep Navy | Subsection titles, card headings |
| **Body** | Montserrat Regular 400 · 15–17px · `#475569` or Slate Gray | Paragraphs, descriptions |
| **Eyebrow** | Montserrat SemiBold 600 · 12px · uppercase · `+0.12em` · Electric Blue | Section labels (`.section-eyebrow`) |
| **Caption** | Montserrat Regular 400 · 11–14px · Slate Gray | Fine print, metadata, disclosures |
| **CTA / Button** | Montserrat SemiBold 600 · 15px · uppercase · White on Electric Blue | Primary action buttons |
| **Nav Links** | Montserrat SemiBold 600 · 14px · uppercase · Deep Navy | Navigation items |

### Rules
- Line height: `1.6–1.75` for body text · `1.0–1.05` for headlines
- Letter spacing: `+0.02em` to `+0.12em` for all-caps text · `-0.02em` for large headlines
- Max line width: `65–75ch` for body paragraphs (readability)
- Section titles use `<em>` for the Electric Blue emphasis line — `<em>` is restyled to `font-style: normal`

---

## 5. Language Rules — Compliance Critical

Three things about this business changed. Copy that contradicts them is not an off-brand tone problem — it is a false claim or a regulatory exposure. **Do not reintroduce any of it.**

### 5.1 No Engineering Services

The founder has an **electrical engineering background** but is **not a licensed Professional Engineer**. Advertising engineering services without licensure is a regulatory exposure in North Carolina.

**The distinction is credentials we hold vs. services we advertise.** A blanket find-and-replace on "engineer" produces wrong output — it will delete the credential language, which is accurate and valuable.

#### ✅ Keep — these are correct
- "electrical engineering background" (About/bio context)
- "trained as an electrical engineer"
- "professional engineer licensed in North Carolina" — **only** inside the licensure disclaimer

#### ❌ Remove — these assert or imply we provide engineering services

| Never write | Write instead |
|---|---|
| We engineer solutions | Know before you build |
| Engineering-backed EV charging solutions | EV charging assessment and project management |
| Electrical engineering analysis | Electrical capacity review |
| We engineer your charging solution from the ground up | We tell you what your property can actually support |
| Engineering-backed site assessments | Site assessments |
| Our engineering team | Our assessment process |
| Engineered design | Recommended configuration |
| Engineering Carolina's EV Charging Infrastructure | Know before you build |
| Engineering Assessment (as a service name) | Capacity Review |

**Rule:** never use *engineer* as a verb describing our service, and never as a noun describing our role in a client engagement. Also avoid *design* as a verb for our deliverable — say **recommended configuration** or **specification**.

**Current state of `*.html`:** the only permitted matches for `engineer` are `electrical engineering background` and `professional engineer licensed in North Carolina`. Verify with the audit in §5.5.

### 5.2 Equipment Leasing Is Retired

The leasing model is dead. Never write:

- "lease", "leasing", "lease options", "equipment lease"
- "capital-efficient" / "capital-efficient model"
- "reduce upfront cost by up to 70%" (or any variant of that figure)
- "one monthly fee", "predictable monthly fee", "monthly equipment fee"
- "fully managed" as the core economic proposition
- "equipment upgrades included", "no technology obsolescence risk"

The current economics are: **flat fees** for assessment and bid management, **margin** on equipment, **year one of support included** then a retainer.

> ⚠️ The audit in §5.5 greps for the bare substring `lease`, which also matches **please** and **release**. Avoid those words in HTML copy so the check stays clean. Real-estate "lease negotiations" is semantically fine but still fails the grep — write **tenant renewals** instead.

### 5.3 We Resell Equipment — No Independence Claims

We are an **authorized reseller** of charging hardware and management software and earn margin on it. Any claim that we sell nothing, take no commissions, or are unbiased is now **false**.

| Never write | Write instead |
|---|---|
| We sell nothing, so our advice is unbiased | The equipment disclosure (§6.2) |
| We receive no compensation from any manufacturer | We are an authorized reseller and earn margin on equipment we supply |
| Independent EV charging assessment | EV charging assessment and project management |
| We have nothing to sell you afterward | One number to call when something breaks |
| We do not sell chargers, install them, or take commissions | *(delete — use the positioning blocks in §7.3)* |

**"Independent" may be used only in reference to the electrical contractor bidding** — e.g. "vetted independent electrical contractors." Never in reference to equipment, advice, or the assessment.

**What we *may* still claim, because it is true:** we take **no commission, referral fee, or percentage of the electrical installation**, and our bid-management fee is **flat**. This is the honest version of the old independence pitch and it should be stated plainly.

### 5.4 What Protects The Customer — Lead With Sequence

When explaining why our equipment margin doesn't compromise the advice, the answer is **sequence, not disinterest**:

> The capacity analysis and recommended configuration are finished and in your hands before any equipment proposal exists, and the specification is written so other products could satisfy it.

### 5.5 Copy Audit

Run before committing any copy change:

```bash
# Should return ONLY "electrical engineering background"
# or "professional engineer licensed in North Carolina"
grep -rin "engineer" --include="*.html" .

# Should return nothing
grep -rin "unbiased\|nothing to sell\|no commission from any manufacturer\|leasing\|lease" --include="*.html" .

# Should be present and unchanged
grep -rn "formspree" --include="*.html" .
```

---

## 6. Required Disclosures

Both disclosures appear in the footer of **every page**. Reproduce them verbatim.

### 6.1 Licensure Disclaimer
Footer of every page. Also stated in the "What We Are Not" block on the home page.

> Carolina Recharge is not a professional engineering firm and does not provide engineering services. Where a project requires drawings sealed by a professional engineer licensed in North Carolina, we identify that requirement and refer qualified licensed professionals.

### 6.2 Equipment Disclosure
Footer of every page, **and anywhere equipment is recommended or sold** (currently the service ladder section, in the `.disclosure` callout).

> We are an authorized reseller of the charging hardware and software we recommend, sold as a bundle, and we say so up front. You're free to use any provider, and our fees don't change if you do. On the electrical work, which is the larger cost, we take no commission and no percentage — it's bid competitively on your behalf.

**If you add a new page, it needs both.** If you add a section that recommends or sells equipment, it needs 6.2 inline.

---

## 7. Voice & Messaging

### 7.1 Three Pillars

| Pillar | What It Means |
|---|---|
| **Technical** | Speak with precision. Load calculations, NEC 220/625/625.42, service capacity, sealed drawings — use the right language. Property managers are sophisticated; don't talk down to them. |
| **Forward-Thinking** | We're excited about what's coming. EV adoption, grid modernization, clean energy — we're building the infrastructure for tomorrow. |
| **Carolina-Proud** | We're local. We understand Triad properties, Carolina weather, Carolina people. We're invested in this community. |

### 7.2 Core Messages

**Primary:** *Know before you build.* — The capacity answer comes first, costs the least, and determines everything downstream. Nothing gets specified, bid, or bought until the property owner knows what their service can carry.

**Secondary:** *One number to call.* — We supply the hardware and software and support it directly. When something breaks there is nobody else to blame.

**Standard subhead:**
> EV charging assessment and project management for Triad properties. We tell you what your property can actually support, run the electrical bidding on your behalf, and stay on the phone after it's switched on.

### 7.3 The Three Positioning Blocks

These carry the commercial model. Use them on the home page and/or a services page. The wording is deliberate — edit with care.

**One number to call**
> Most property managers who've done this before have a story about a charger that's been offline for months and a vendor who won't return a call. We supply the hardware and management software ourselves and support them directly, so when something stops working there's one number to call and nobody else to blame.

**Where we take nothing**
> The electrical work is bid competitively among vetted contractors, and we take no commission, referral fee, or percentage of the installation. That part of the project is largely commodity work governed by code, and you should have three prices for it. Our fee for managing that process is flat, so it doesn't grow when the project does.

**Where we earn margin, and what protects you**
> We're an authorized reseller of the charging hardware and management software we recommend, and we earn margin when you buy it from us. You're free to choose any provider, and nothing about the assessment or our fees changes if you do. What protects you is sequence: the capacity analysis and recommended configuration are finished and in your hands before any equipment proposal exists, and the specification is written so other products could satisfy it.

### 7.4 Do's and Don'ts

| ✅ Do | ❌ Don't |
|---|---|
| Use specific technical language (load calculation, NEC 625.42, service upgrade, kW output) | Over-explain or condescend to property managers |
| Lead with the capacity/service-upgrade question — it's the real cost driver | Lead with hardware or charger brands |
| Connect to Carolina pride and local market knowledge | Use generic "nationwide service provider" language |
| Lead with business value (tenant retention, property value, competitive advantage) | Lead with environmental messaging — it's secondary to ROI |
| Be confident and action-oriented ("Schedule a 25-minute call") | Be vague or passive ("Feel free to reach out if you'd like…") |
| State plainly what we don't do — it builds trust | Imply we perform electrical work, pull permits as a contractor, or stamp drawings |
| Disclose the reseller relationship up front | Claim independence, neutrality, or that we sell nothing |

### 7.5 Key Proof Points
- Capacity analysis delivered before any equipment proposal exists
- Electrical work bid competitively among vetted independent contractors — no commission, no percentage
- Flat fees for bid management that don't grow with the project
- Electrical engineering background — not just a sales team
- Local Triad presence — on-site quickly
- Equipment supported directly by us, year one included
- Carolina community commitment

### 7.6 Boilerplate Copy

**One-liner:**
> EV charging assessment and project management for Triad properties. Know what your property can support before you build.

**Two-sentence:**
> Carolina Recharge tells multifamily and commercial property owners across the NC Triad what their existing electrical service can actually support, then runs a competitive bid process for the electrical work. We supply and support the charging hardware and management software as an authorized reseller — and we say so up front.

**CTA (standard):**
> Schedule a 25-Minute Call

---

## 8. Service Ladder

The current offering. Each step stands on its own; customers choose how far to go.

| Service | Fee | What you get |
|---|---|---|
| **Discovery call, 25 min** | No charge | A conversation about the property and what's driving the question, followed by a written one-page summary of preliminary findings. |
| **Site Feasibility Review** | $850–1,200 | 5–8 page memo: electrical capacity, candidate locations, recommended port count, cost range at ±25%, permitting flags, incentive eligibility, and a go/no-go recommendation. |
| **Full Site Assessment** | $2,800–4,500 | Load calculation per NEC 220 and 625, costed build scenarios, conceptual layout, line-item estimate suitable for bidding, vendor-neutral equipment specification, incentive roadmap. |
| **Bid Management** | $1,200–1,800 flat | Bid package, contractor solicitation, bid leveling, written recommendation. |
| **Bid Management with Oversight** | $2,400–3,200 flat | Above plus milestone site observation, punch list, commissioning verification, closeout documentation. |
| **Incentive Application Support** | $750 | Preparation and assembly of utility and tax incentive applications, filed by the customer of record. |
| **Charging hardware and software** | Quoted | Supply, configuration, and commissioning of our vetted hardware and management platform, sold as a bundle with the software subscription included for an initial term. Optional — customer may choose any provider. |
| **Equipment support** | Year 1 included, then retainer | Remote monitoring, fault response, portal administration, warranty handling, and quarterly reporting. |

**Terms:** The Site Feasibility Review fee credits in full against a Full Site Assessment booked within 90 days. Portfolio pricing available for five or more properties.

**Published service claims — keep new copy consistent with these.** The home page stat grid commits to two things in public:

| Claim | Where it appears |
|---|---|
| Written findings within **5 days of the site visit** | `.proof-stats` quadrant |
| Remote monitoring, fault response, and portal administration **included for year one, extendable on retainer** | `.proof-stats` quadrant + `.proof-note` footnote |

Do not publish a different turnaround figure elsewhere on the site without changing both.

> 🔒 **Fee amounts are internal.** As of this version, **the public site lists the services and deliverables but does not publish fee amounts** — only fee *structures* ("flat fee", "optional", "year one included"). Publishing rates is the founder's call. **Ask before putting dollar figures for our services on the site.**
>
> This does not apply to *project* cost figures like the $20,000–100,000 service-upgrade range, which are third-party costs and are published deliberately.

---

## 9. UI Patterns

### Buttons

```css
/* Primary CTA */
.btn-primary {
  background: var(--color-electric-blue);
  color: #FFFFFF;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 15px;
  padding: 16px 32px;
  border-radius: 6px;
  border: none;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  cursor: pointer;
}

/* Secondary / Ghost — used on dark backgrounds */
.btn-ghost {
  background: transparent;
  color: rgba(255,255,255,0.7);
  border: 2px solid rgba(255,255,255,0.2);
  font-weight: 600;
  font-size: 15px;
  padding: 14px 28px;
  border-radius: 6px;
}
```

### Section Layout

- **Dark bands:** `--navy-dark` background · white text · blueprint grid overlay · used for hero, positioning, and CTA
- **Content sections:** White background · standard text styles
- **Alternating rows:** `#F8FAFC` (Cloud White) · alternate only with white, never with a color
- **Max content width:** `1200px` (`1000px` for the service ladder) · centered with `auto` side margins
- **Section padding:** `100px` top/bottom desktop · `64px` at ≤768px · `48px` at ≤480px

### Cards

```css
.card {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
```

### Disclosure Callout
Use `.disclosure` (white card, Electric Blue left border) for the equipment disclosure wherever equipment is recommended. Use `.not-block` (Cloud White card, Deep Navy left border) for the "What We Are Not" statement.

### Dividers / Accents
Use Electric Blue (`#0A7AFF`) horizontal rules or left-border accents on callout blocks. Do not use decorative images as dividers.

### Links
- Default: Electric Blue `#0A7AFF`
- Hover: Deep Navy `#1E3A8A` (or white on dark backgrounds)
- Never use underlines in navigation — only in inline body text links

### Fixed Nav And Anchor Offsets
The nav is `position: fixed`, so an anchor jump lands the target section's top edge underneath it. Every jump target (`#services`, `#process`, `#about`, `#contact`) therefore carries `scroll-margin-top: calc(var(--nav-h) + 24px)`. **A new section with an `id` that anything links to needs to be added to that selector**, or its heading will sit under the nav.

`--nav-h` is the single source of truth for nav height (72px, 64px at ≤768px). Use it rather than repeating the pixel value, so scroll offsets can never drift out of sync with the nav.

The form's post-submit scroll targets `#contact` — not the confirmation panel — precisely so it inherits that offset.

### Responsive
Breakpoints live at the bottom of `styles.css`: **1080px** (two-column layouts collapse), **900px** (cards stack, ladder rows stack, decorative charger image hides), **768px** (nav text links collapse to the CTA only, section padding drops, form rows stack), **480px** (fine tuning). A `prefers-reduced-motion` block disables the reveal animations. **Any new multi-column section needs a rule in these blocks.**

### Contact Form
- Endpoint: `https://formspree.io/f/mkjwqezy` — **do not change the action URL or the field names** (`name`, `email`, `property`, `property-type`, `message`). `_gotcha` is the honeypot.
- **The form submits in the background, not by navigating.** The handler in `index.html` posts via `fetch` with `Accept: application/json`, then hides the form and reveals `#form-success` in place. The visitor never leaves the page, on success or failure.
- **Do not add a `_next` field.** Formspree's redirect is a paid feature; on the free tier it does nothing. The inline confirmation exists specifically so the branded experience does not depend on it.
- Failures render in `#form-error` in brand styling, with the form and the visitor's typed answers left intact so they can retry. Server-supplied messages are written with `textContent`, never `innerHTML`.
- **No-JS fallback:** the form keeps a real `action` and `method`, so with JavaScript disabled it posts normally and lands on Formspree's own hosted confirmation. Unbranded, but it still reaches the inbox — do not remove those attributes.
- Free-tier submission caps apply. If volume outgrows them, the migration path is to swap the `action` URL for another provider (Web3Forms, FormSubmit) or point it at a serverless function — the markup and handler need no other change.
- Analytics: **there is currently no GA4 property on this site.** When one is added, the `generate_lead` conversion belongs in the success branch of the form handler in `index.html` (marked with a comment there) — **not** on `thank-you.html`, which is no longer in the submit flow.

### No Frameworks
Hand-coded HTML and CSS only. **Do not introduce React, Tailwind, a build step, or npm.** One stylesheet, one small inline script for scroll reveals and the nav shadow.

---

## 10. File Structure

Actual repository contents:

```
/
  index.html               ← Single-page site (all sections, anchor navigation)
  thank-you.html           ← Branded confirmation page. Currently UNREFERENCED: the
                             form confirms inline instead. Retained for a future move
                             to a provider with a free redirect, or a serverless endpoint.
  styles.css               ← All styles, responsive rules at the bottom
  CLAUDE.md                ← This file
  README.md
  /images
    logo-horizontal.svg    ← Primary logo — do not modify paths or viewBox
    logo-stacked.svg       ← Stacked variant
    favicon.svg            ← Icon-only mark, derived from the logo path (see below)
    favicon-32.png         ← 32×32 raster fallback
    apple-touch-icon.png   ← 180×180 home-screen icon
    wall-charger.png       ← Hero decorative image
    charger-unit.png       ← Unused; retained from earlier revision
```

### Favicon
`favicon.svg` reuses the **same Census boundary path** as the logo, filled rather than stroked (a 2px stroke vanishes at 16px) on a `--navy-dark` rounded tile, with the Triad node enlarged so it survives downscaling. It is a **derived asset, not the logo** — the no-recolor rule in §2 applies to the logo files, which are untouched.

If the boundary path ever changes, regenerate the favicon from `logo-horizontal.svg` rather than editing it by hand, and re-render the two PNGs from the SVG. Every page needs all three `<link>` tags plus `<meta name="theme-color" content="#0F2060">`.

Still missing: `og-image.png` (1200×630) for social sharing previews.

---

## Contact

**Daniel Black** — Founder  
daniel.black@carolinarecharge.com  
carolinarecharge.com  
Winston-Salem, NC

---

*Carolina Recharge Brand Guidelines · Version 2.0 · August 2026*  
*Powering Carolina's Electric Future*
