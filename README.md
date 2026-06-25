# JDI Distribution — Revamped Pricing Tool

Internal pricing and quoting tool for JDI Distribution. Builds PDF and XLSX customer quotes from packaging configuration, MOQ tables, and cost inputs.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| PDF generation | jsPDF + jspdf-autotable |
| Excel generation | SheetJS (xlsx) |
| State management | React Context (`ProjectContext`) |
| Backend / persistence | Zoho Catalyst serverless functions |
| Deployment | Zoho Catalyst (uploaded as `dist/out.zip`) |

---

## Project Structure

```
revamped-pricing-tool/
├── app/                          # Frontend Vite app
│   ├── src/
│   │   ├── components/
│   │   │   ├── navbar/
│   │   │   │   ├── Navbar.tsx              # Top navigation bar
│   │   │   │   └── NavbarSaveButton.tsx    # Save/new quote controls in navbar
│   │   │   ├── project/
│   │   │   │   ├── ProjectInfoSection.tsx  # Customer + brand + project type fields
│   │   │   │   ├── ProjectDetails.tsx      # CPO table, raw materials, testing sections
│   │   │   │   ├── ColumnsSection.tsx      # Legacy packaging columns (read-only shim)
│   │   │   │   ├── PackagingSummarySection.tsx  # Simplified packaging input UI
│   │   │   │   ├── CoPackingDetails.tsx    # Co-packing processes UI
│   │   │   │   ├── CoPackingSummaryPanel.tsx   # Co-packing summary output panel
│   │   │   │   ├── SummaryTables.tsx       # Quote summary table display
│   │   │   │   ├── FillRateOverridePopover.tsx
│   │   │   │   ├── PalletToolPopover.tsx
│   │   │   │   └── CompanySearchInput.tsx
│   │   │   ├── quote/
│   │   │   │   ├── SaveQuoteButton.tsx     # Quote-page save modal (Save as New / Update Existing tabs)
│   │   │   │   ├── ManageQuotes.tsx        # Load saved quotes modal
│   │   │   │   ├── PdfPreviewModal.tsx     # PDF preview + inline text editing
│   │   │   │   ├── PdfTextEditorModal.tsx  # Customer info editor within PDF modal
│   │   │   │   └── XlsxMoqModal.tsx        # MOQ selector for XLSX export
│   │   │   ├── ui/
│   │   │   │   ├── CurrencyInput.tsx       # DO NOT MODIFY — shared numeric input
│   │   │   │   └── DatePicker.tsx
│   │   │   ├── CrmStartModal.tsx
│   │   │   └── SectionSidebar.tsx
│   │   ├── lib/
│   │   │   ├── ProjectContext.tsx          # Global state: all inputs, computed results, save state
│   │   │   ├── calculations.ts             # Standard mode pricing math (packaging, materials, testing)
│   │   │   ├── coPackingCalculations.ts    # Co-packing labor + overhead math
│   │   │   ├── types.ts                    # All shared TypeScript interfaces
│   │   │   ├── generateQuotePDF.ts         # Standard mode PDF builder
│   │   │   ├── generateCoPackingQuotePDF.ts # Co-packing PDF builder
│   │   │   ├── generateQuoteXLSX.ts        # DO NOT MODIFY — XLSX export
│   │   │   ├── generateCoPackingExcel.ts   # Co-packing XLSX export
│   │   │   ├── uid.ts                      # Unique ID helper
│   │   │   └── SectionRequiredContext.tsx  # Required/Not Required toggle context
│   │   ├── pages/
│   │   │   ├── Home.tsx                    # Main input page (project info + all sections)
│   │   │   ├── QuotePage.tsx               # Quote output, pricing adjustments, exports
│   │   │   └── SavedQuotesPage.tsx         # Saved quotes list + load
│   │   └── main.tsx                        # App entry point + router
│   ├── scripts/
│   │   ├── lowercase-assets.mjs            # Post-build: lowercase asset filenames
│   │   └── zip-dist.mjs                    # Post-build: creates dist/out.zip for Catalyst upload
│   └── dist/
│       └── out.zip                         # ← Upload this to Zoho Catalyst after each build
├── functions/
│   └── quotes-api/
│       └── index.js                        # Catalyst serverless: CRUD for saved quotes + CRM push
└── README.md
```

---

## Key State — `ProjectContext.tsx`

All app state lives in a single React Context. Key state groups:

| Group | Variables | Purpose |
|---|---|---|
| Project inputs | `formData`, `customer`, `selectedBrand`, `projectType` | Core project metadata |
| Packaging | `packagingLevels` | Array of `PackagingLevel` objects driving all packaging cost calculations |
| MOQ table | `moqRows` | Each row = one MOQ tier with case pack config |
| Pricing overrides | `moqMargins`, `moqPpuInputs`, `moqLastEdited`, `whatIfPpus`, `costPpuOverrides` | Per-MOQ manual PPU/margin adjustments |
| Co-packing | `coPackingState`, `coPackingProcesses`, `coPackingResults` | Co-packing mode inputs and computed outputs |
| Fees | `additionalFees` | Extra line items added to quote |
| Computed outputs | `summaryRows`, `summaryTableRows`, `allMoqResults`, `perMoqSummaryRows` | Derived from packaging levels via `calculations.ts` |
| Save state | `saveState`, `markSaved`, `clearSave`, `loadQuoteState` | Tracks current saved quote ID/name and unsaved changes |
| CRM | `crmAccountId`, `crmContactId` | Zoho CRM link for quote push |

---

## Data Flow

```
PackagingLevels (user input)
        │
        ▼
calculations.ts
        │
        ├── summaryRows         → Summary panel (Our Cost / Customer Price per category)
        ├── summaryTableRows    → Details table + PDF line items
        └── allMoqResults       → MOQ pricing table (one row per MOQ)
                │
                ▼
        QuotePage.tsx
                │
                ├── generateQuotePDF.ts      → PDF download / preview
                ├── generateQuoteXLSX.ts     → XLSX download
                └── SaveQuoteButton.tsx      → Persists all state to Catalyst API
```

---

## Save / Load Flow

### Saving
Two save entry points both now use an **identical payload**:

1. **Navbar save button** (`NavbarSaveButton.tsx`) — auto-saves to existing quote ID, or opens "Save as New" modal for unnamed quotes.
2. **Quote page save button** (`SaveQuoteButton.tsx`) — tabbed modal with "Save as New" and "Update Existing" tabs.

Both serialize:
```ts
{
  moqRows, columns, formData, customer, selectedBrand,
  crmAccountId, crmContactId,
  packagingLevels, projectType,
  coPackingState, coPackingProcesses, additionalFees,
  moqMargins, moqPpuInputs, moqLastEdited,
  whatIfPpus, costPpuOverrides
}
```

### Loading
`loadQuoteState()` in `ProjectContext.tsx` restores all fields above, including pricing override maps. Legacy quotes (saved before `packagingLevels` existed) are reconstructed from the old `columns` array using `col.level` as the display name.

---

## Build & Deploy

```bash
cd app
npm run build
# Outputs: dist/out.zip
# Upload dist/out.zip to Zoho Catalyst
```

The build pipeline runs:
1. `tsc -b` — TypeScript type check
2. `vite build` — Bundle
3. `scripts/lowercase-assets.mjs` — Normalize asset filenames
4. `scripts/zip-dist.mjs` — Package into `out.zip`

---

## Permanent Constraints

These files must **never** be modified without explicit instruction:

| File | Reason |
|---|---|
| `app/src/components/ui/CurrencyInput.tsx` | Shared input used everywhere; bugs cascade |
| `app/src/lib/generateQuoteXLSX.ts` | Excel output format is fixed |
| `app/src/lib/calculations.ts` | Core pricing math — only touch for explicit bug fixes |
| `app/src/lib/ProjectContext.tsx` | Global state — only touch for explicit fixes |

Do not change any colors in the app.

---

## Changelog

### 2026-06-24 — Save state unification + blending removal + misc fixes

#### Save state unification (root cause fixes from discrepancy report)

**Problem:** Two save flows serialized different data. The navbar save omitted `packagingLevels`, `projectType`, `coPackingState`, `coPackingProcesses`, `additionalFees`, and all pricing override maps. The quote-page save passed empty `{}` for `moqPpuInputs` and `moqLastEdited`, losing manual PPU overrides on every save.

**Files changed:**
- `app/src/components/navbar/NavbarSaveButton.tsx` — `quoteData()` now includes all missing fields
- `app/src/pages/QuotePage.tsx` — `SaveQuoteButton` now receives real `moqMargins`, `moqPpuInputs`, `moqLastEdited`, `whatIfPpus`, `costPpuOverrides`, `additionalFees` from context instead of `{}`
- `app/src/lib/ProjectContext.tsx` — `loadQuoteState` type signature extended; now restores `moqMargins`, `moqPpuInputs`, `moqLastEdited`, `whatIfPpus`, `costPpuOverrides` when loading a saved quote

#### Blending section removal

**Problem:** The blending section was visible in the UI despite being wrapped in `{false && ...}` in `CoPackingDetails.tsx`. The live rendering was coming from `ProjectDetails.tsx`, which had a separate full blending card (lines 713–1035) that was never guarded.

**Files changed:**
- `app/src/components/project/ProjectDetails.tsx` — removed entire blending IIFE block including card, recipe table, and outputs panel; removed `BlendIngredient` import, `blendingOpen` state, `coPackingState`/`setCoPackingField` destructure
- `app/src/components/project/CoPackingDetails.tsx` — blending block was already `{false && ...}` guarded (no change needed)
- `app/src/lib/coPackingCalculations.ts` — removed blending result push, removed `blendOur` from overhead total, removed Global Minimum Labor Adjustment block, removed unused `billedHrs` helper
- `app/src/lib/generateCoPackingQuotePDF.ts` — removed blending PDF row (lines ~318-333), removed `lbl !== "blending"` filter, removed Blending Recipe Breakdown section, removed unused `fmtAmt` helper
- `app/src/pages/Home.tsx` — removed `{ id: "section-blending", label: "Blending", visible: true }` from co-packing sidebar sections array

#### Testing as individual line items

**Files changed:**
- `app/src/lib/calculations.ts` — each testing row is now its own `summaryRow` and `summaryTableRow` entry instead of being bundled inside the Materials row
- `app/src/lib/generateQuotePDF.ts` — PDF reads testing line items from `summaryTableRows` (prefix `testing –`) rather than from a hardcoded inline block

#### CPO level name persistence fix

**Problem:** Loading saved quotes reset CPO level names to defaults ("Individual Units") because quotes saved before `packagingLevels` was added had `packagingLevels: undefined`.

**Files changed:**
- `app/src/lib/ProjectContext.tsx` — `loadQuoteState` now reconstructs `packagingLevels` from legacy `columns` array when `packagingLevels` is absent, using `col.level` as `customLevelName`
- `app/src/components/quote/ManageQuotes.tsx` — `handleLoad` now passes all fields including `packagingLevels`, `projectType`, `coPackingState`, `coPackingProcesses`, `crmAccountId`, `crmContactId`
- `app/src/pages/SavedQuotesPage.tsx` — same fix as ManageQuotes

#### Product Name in PDF

**Change:** PDF "Product Name" field now uses `customer.productName` (from Project Info) first, falling back to `primaryProductName` (packaging type label) only when the field is blank.

**Files changed:**
- `app/src/lib/generateQuotePDF.ts` — swapped priority in three locations: product name block, auto-overview text, filename

#### Project Info — remove Required/Not Required toggle

**Change:** The Required / Not Required toggle was removed from the Project Info section header.

**Files changed:**
- `app/src/components/project/ProjectInfoSection.tsx` — removed `RequiredToggle` import, `useSectionRequired` hook, `isNR` variable, and `!isNR` guards on open/collapse logic

---

### 2026-06-25 — Processes table column width

#### Narrow Processes table columns to match Packaging Line Setup

**Change:** The Processes section table column width was reduced from `168px` to `160px` to match the Packaging Line Setup table, which uses `160px` columns.

**Files changed:**
- `app/src/components/project/CoPackingProcesses.tsx` — `minWidth` on expanded column headers changed from `168` to `160`; `tableMinWidth` formula updated from `185 + visibleCols * 168 + ...` to `185 + visibleCols * 160 + ...`
