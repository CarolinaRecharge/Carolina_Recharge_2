# Carolina Recharge — Brand Guidelines

> **Purpose:** This document is the single source of truth for all Carolina Recharge visual and voice decisions. Reference it when building new pages, writing copy, creating assets, or onboarding contributors to the website or any branded material.

---

## Table of Contents

1. [Brand Identity](#1-brand-identity)
2. [Logo](#2-logo)
3. [Color Palette](#3-color-palette)
4. [Typography](#4-typography)
5. [Voice & Messaging](#5-voice--messaging)
6. [UI Patterns](#6-ui-patterns)
7. [File Structure](#7-file-structure)

---

## 1. Brand Identity

| | |
|---|---|
| **Company** | Carolina Recharge |
| **Tagline** | Powering Carolina's Electric Future |
| **Core Message** | We engineer solutions. We power progress. |
| **Positioning** | Local NC partner with deep electrical engineering expertise, serving mid-market properties in the Triad region (Winston-Salem, Greensboro, High Point) |
| **Personality** | Innovative & forward-thinking · Technical & expert · Carolina-proud |

### Who We Serve
Primary customers are property managers and owners of **multifamily apartment communities** and **Class B office buildings** in the NC Triad. They need technical expertise they can trust and a local partner who understands their market — not a national call center.

---

## 2. Logo

### Files
| File | Use |
|---|---|
| `images/logo-horizontal.svg` | Website header, letterhead, email signatures, horizontal layouts |
| `images/logo-horizontal.png` | Fallback for email clients and platforms that don't support SVG |
| `images/logo-stacked.svg` | Square formats, social media profile images |
| `images/favicon.ico` | Browser tab icon |

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
- **Primary:** [Montserrat](https://fonts.google.com/specimen/Montserrat) (Google Fonts, free)
- **Body fallback:** Inter → Arial → sans-serif

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
| **H1** | Montserrat Bold 800 · 40–48px · Electric Blue `#0A7AFF` | Hero headlines, major page titles |
| **H2** | Montserrat SemiBold 700 · 28–32px · Deep Navy `#1E3A8A` | Section headers |
| **H3** | Montserrat SemiBold 600 · 20–24px · Deep Navy `#1E3A8A` | Subsection titles, card headings |
| **Body** | Montserrat Regular 400 · 16–18px · Deep Navy `#1E3A8A` | Paragraphs, descriptions |
| **Caption** | Montserrat Regular 400 · 12–14px · Slate Gray `#64748B` | Image captions, fine print, metadata |
| **CTA / Button** | Montserrat SemiBold 600 · 16–18px · White on Electric Blue | Primary action buttons |
| **Nav Links** | Montserrat SemiBold 600 · 15–16px · Deep Navy `#1E3A8A` | Navigation items |

### Rules
- Line height: `1.6` for body text · `1.2` for headlines
- Letter spacing: `+0.02em` for all-caps text · normal for mixed case
- Max line width: `65–75ch` for body paragraphs (readability)
- Paragraph spacing: `1.5×` line height between paragraphs

---

## 5. Voice & Messaging

### Three Pillars

| Pillar | What It Means |
|---|---|
| **Technical** | Speak with precision. Load calculations, NEC compliance, electrical capacity — use the right language. Property managers are sophisticated; don't talk down to them. |
| **Forward-Thinking** | We're excited about what's coming. EV adoption, grid modernization, clean energy — we're building the infrastructure for tomorrow. |
| **Carolina-Proud** | We're local. We understand Triad properties, Carolina weather, Carolina people. We're invested in this community. |

### Core Messages

**Primary:** *We engineer solutions.* — This isn't guesswork. Every assessment is backed by electrical engineering expertise. Load calculations are precise. Equipment recommendations are data-driven.

**Secondary:** *We power progress.* — EV adoption is accelerating. Every installation is another step toward sustainable transportation in Carolina.

### Do's and Don'ts

| ✅ Do | ❌ Don't |
|---|---|
| Use specific technical language (load calculations, NEC compliance, kW output) | Over-explain or condescend to property managers |
| Connect to Carolina pride and local market knowledge | Use generic "nationwide service provider" language |
| Lead with business value (tenant retention, property value, competitive advantage) | Lead with environmental messaging — it's secondary to ROI |
| Be confident and action-oriented ("Schedule your assessment today") | Be vague or passive ("Feel free to reach out if you'd like…") |
| Reference specific cost savings and payback periods | Use vague ranges without context |

### Key Proof Points
- Engineering-backed solutions — not just installation
- Local Triad presence — on-site within hours
- Capital-efficient model — lease options reduce upfront cost up to 70%
- Future-proof infrastructure — ready for tomorrow's EVs
- Carolina community commitment

### Boilerplate Copy

**One-liner:**
> Engineering-backed EV charging solutions for Triad properties. Local expertise. Capital-efficient models. Future-proof infrastructure.

**Two-sentence:**
> Carolina Recharge engineers EV charging infrastructure for multifamily and commercial properties across the NC Triad. We combine electrical engineering expertise with a capital-efficient leasing model that reduces upfront costs by up to 70%.

**CTA (standard):**
> Schedule a 15-Minute Call

---

## 6. UI Patterns

### Buttons

```css
/* Primary CTA */
.btn-primary {
  background-color: var(--color-electric-blue);
  color: #FFFFFF;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 16px;
  padding: 14px 28px;
  border-radius: 6px;
  border: none;
  letter-spacing: 0.02em;
  cursor: pointer;
}

/* Secondary / Ghost */
.btn-secondary {
  background-color: transparent;
  color: var(--color-electric-blue);
  border: 2px solid var(--color-electric-blue);
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 16px;
  padding: 12px 26px;
  border-radius: 6px;
}
```

### Section Layout

- **Hero sections:** Deep Navy or Electric Blue background · White text · Cloud White for subtle alternating sections
- **Content sections:** White background · standard text styles
- **Alternating rows:** `#F8FAFC` (Cloud White) · never alternate with a color — alternate with white
- **Max content width:** `1200px` · centered with `auto` side margins
- **Section padding:** `80px` top/bottom on desktop · `48px` on mobile

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

### Dividers / Accents
Use Electric Blue (`#0A7AFF`) horizontal rules or left-border accents on callout blocks. Do not use decorative images as dividers.

### Links
- Default: Electric Blue `#0A7AFF`
- Hover: Deep Navy `#1E3A8A`
- Never use underlines in navigation — only in inline body text links

---

## 7. File Structure

Recommended image asset organization within the repo:

```
/images
  logo-horizontal.svg      ← Primary logo (SVG, production)
  logo-horizontal.png      ← Primary logo (PNG fallback)
  logo-stacked.svg         ← Stacked variant
  logo-stacked.png         ← Stacked PNG fallback
  logo-icon-only.svg       ← NC outline + dot, no wordmark
  favicon.ico              ← Browser tab icon
  og-image.png             ← Open Graph / social share image (1200×630)
```

---

## Contact

**Daniel Black** — Founder  
daniel.black@carolinarecharge.com  
carolinarecharge.com  
Winston-Salem, NC

---

*Carolina Recharge Brand Guidelines · Version 1.0 · February 2026*  
*Powering Carolina's Electric Future*
