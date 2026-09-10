# Plan: UI Redesign — Intercom AI Features Style + Module Badge Fix

## Overview

Redesign the MitraKu AI UI/UX to visually align with the Intercom AI features page aesthetic — clean, modern SaaS style with:
- **Feature highlight cards** (icon + title + short description in a grid)
- **Illustrated section banners** (gradient hero-style with decorative visual)
- **Clean pill/badge labels** for each module (not "MODUL 4 — ...")
- **Fix the module numbering inconsistency** — Rename the badge `✨ MODUL 4 — AI COPYWRITING FACTORY` to a logical sequential label (it should be Module 1 since it appears first in the nav, OR re-order module labels to match visual order)

**Non-goals:** No feature removal, no backend changes, no routing/navigation changes.

---

## Intercom AI Features Page — Design Reference

The page (https://www.intercom.com/help/en/articles/6955446-ai-features-available-in-the-inbox) uses:
- **Hero banner:** Large heading + subtitle + colorful AI-themed illustration (gradient blobs, light rays, floating UI cards)
- **Feature cards grid:** Each AI feature shown as a card with an icon/screenshot, title, and 1-2 line description
- **Section separators:** Subtle dividers with colored accent lines
- **Color system:** Deep indigo/purple primary with teal/green accents, white card surfaces
- **Typography:** Large bold headings (700–800 weight), muted descriptive subtitles, tight spacing
- **Badges/pills:** Rounded pill labels ("New", "Beta", "AI-powered") on feature cards
- **Screenshots/illustrations:** Embedded product screenshots inside each feature card
- **CTA callout boxes:** Colored inset boxes with a bold tip or note at the bottom

---

## Problem Statement

1. `✨ MODUL 4 — AI COPYWRITING FACTORY` appears as **the first module tab** in the navigation (after Chat AI), yet is labeled "MODUL 4". This is confusing. The nav order is: Chat AI → Copywriting Factory → Brand Kit → Toko Pintar → Riset Pasar. The MODUL numbering in the header banners should match this nav order.
2. The module header banners are functional but lack the visual richness of the Intercom AI page — they could benefit from illustrated/decorative elements and a card-grid layout for features.
3. The overall module pages (Copywriting, Brand Kit, Market Research, Toko Pintar) have plain form+result layouts with minimal visual hierarchy compared to the Intercom reference.

---

## Sub-Tasks

---

### Sub-Task 1 — Fix Module Badge Numbering

**Intent:** Correct the `MODUL N` label in each view's header banner so the number matches the tab order in the top navigation.

**Current Nav Order:**
1. Chat AI (no module badge needed — it's the main chat)
2. Copywriting Factory → currently says `MODUL 4`
3. Brand Kit Builder → currently says `MODUL 3`
4. Toko Pintar AI → currently says `MODUL 1`
5. Riset Pasar → currently says `MODUL 2`

**Correct Mapping (nav order = module number):**
| Tab Position | View | Current Badge | Correct Badge |
|---|---|---|---|
| 2 | Copywriting Factory | ✨ MODUL 4 — AI COPYWRITING FACTORY | ✨ MODUL 1 — AI COPYWRITING FACTORY |
| 3 | Brand Kit Builder | 🎨 MODUL 3 — AI BRAND KIT BUILDER | 🎨 MODUL 2 — AI BRAND KIT BUILDER |
| 4 | Toko Pintar AI | 🏪 MODUL 1 — TOKO PINTAR AI (RAG CS 24 JAM) | 🏪 MODUL 3 — TOKO PINTAR AI (RAG CS 24 JAM) |
| 5 | Riset Pasar | 📊 MODUL 2 — AI RISET PASAR INSTAN | 📊 MODUL 4 — AI RISET PASAR INSTAN |

**Files:** `public/index.html` — the `.cw-header-badge`, `.bk-header-badge`, `.tp-header-badge`, `.mr-header-badge` elements.

**Expected Outcome:** Every module banner shows the number that matches its left-to-right tab position.

**Status:** [ ] pending

---

### Sub-Task 2 — Redesign Module Header Banners (Intercom-style Hero)

**Intent:** Upgrade the flat header banners on each module view to match the Intercom AI page style — a richer hero section with decorative gradient shapes, a feature highlights row beneath the title, and a "What this module does" overview card.

**Design Spec (per Intercom reference):**
- **Banner:** Gradient background (module-specific color) + subtle abstract SVG blob/ray decoration on the right side
- **Left content:** Module badge pill → bold H1 title → subtitle paragraph → "Powered by AI" pill tag
- **Feature highlights bar:** A horizontal row of 3 mini-cards below the hero, each with an icon + 1-line feature label (e.g., for Copywriting: "📝 Judul SEO", "🎵 Skrip TikTok", "📸 Caption IG")
- **Illustration area:** A subtle decorative element (CSS-only, no external images) — gradient circle/blob or an SVG icon cluster on the banner right side

**Files:**
- `public/index.html` — update `.cw-header-banner`, `.bk-header-banner`, `.tp-header-banner`, `.mr-header-banner` HTML structure
- `public/style.css` — add new CSS classes for the expanded hero banner

**Expected Outcome:** Each module page opens with a visually rich hero section showing the module identity, a short feature list, and Intercom-quality polish.

**Status:** [ ] pending

---

### Sub-Task 3 — Intercom-style Feature Cards on Module Pages

**Intent:** Add a "feature card grid" section to each module page (above the form), similar to how Intercom shows AI capabilities with icons + short description per card.

**Design Spec:**
- 3-column card grid (responsive: 2-col on tablet, 1-col on mobile)
- Each card: rounded border, white surface, top accent color bar, icon (emoji or SVG), bold title, 2-line description
- Cards are purely informational/decorative — they don't need click functionality
- On mobile, the grid collapses and cards are scrollable

**Module-specific cards:**

**Copywriting Factory (3 cards):**
- 🛒 "Copy Shopee SEO" — Judul produk + deskripsi persuasif berbasis kata kunci
- 🎵 "Skrip TikTok Viral" — Hook 3 detik, narasi 30–45s, sound & hashtag
- 📸 "Caption Instagram" — Caption utama, alternatif, CTA + carousel ideas

**Brand Kit Builder (3 cards):**
- 🎨 "Palet Warna AI" — Kombinasi warna brand yang harmonis & modern
- ✏️ "Tagline Generator" — 3 opsi tagline sesuai kepribadian brand
- 📖 "Brand Story" — Narasi brand profesional + pilar konten

**Toko Pintar AI (3 cards):**
- 📦 "Katalog Produk RAG" — Database produk untuk CS berbasis konteks
- 🤖 "Simulasi Chat CS" — Uji chatbot dengan pertanyaan pelanggan nyata
- 🔗 "Widget & Embed" — Link & iframe siap pasang di toko online

**Riset Pasar (3 cards):**
- 💰 "Analisis Harga" — Range harga kompetitor + rekomendasi posisi harga
- 🏆 "Strategi Diferensiasi" — 3 keunggulan kompetitif yang bisa diklaim
- 🔍 "Kata Kunci SEO" — 5 keyword populer + rekomendasi platform

**Files:**
- `public/index.html` — insert card grid HTML before each module's form panel
- `public/style.css` — add `.module-feature-cards`, `.mfc-card`, `.mfc-icon`, `.mfc-title`, `.mfc-desc` CSS

**Expected Outcome:** Each module page has a clean feature-showcase grid above the form, making the page feel like a polished SaaS product page.

**Status:** [ ] pending

---

### Sub-Task 4 — Typography & Spacing Polish (Intercom-aligned)

**Intent:** Tighten the visual hierarchy across module pages to match Intercom's crisp editorial style — larger bold headings, better label sizing, consistent section spacing, and subtle dividers.

**Changes:**
- Module hero H1 titles: increase to `1.75rem` (currently `1.4rem`) with `font-weight: 800`
- Feature card grid: add `margin-bottom: 2rem` section gap before the form
- Form panel labels: ensure `font-weight: 600` and `font-size: 0.8rem` uppercase track-widened style for section labels
- Add a subtle horizontal rule divider (`1px` `--border-subtle`) between hero banner and feature cards section
- Card hover state: gentle `translateY(-2px)` lift + shadow elevation on `.mfc-card:hover`

**Files:** `public/style.css`

**Expected Outcome:** The module pages feel visually structured like a real SaaS product page, not a raw form.

**Status:** [ ] pending

---

## File Map

| File | Sub-Tasks |
|---|---|
| `public/index.html` | Sub-Task 1, 2, 3 |
| `public/style.css` | Sub-Task 2, 3, 4 |

## Non-Goals (Do Not Touch)

- All JavaScript logic (`script.js`) — no behavioral changes
- Backend routes (`index.js`)
- Widget files (`widget.html`, `widget.css`, `widget.js`)
- Any existing CSS class that affects form/result layout
- Feature functionality of any module
