# GTM Analytics Audit - Example Output

This shows the expected output format when you invoke `/gtm-analytics-audit` on a Next.js SaaS site.

---

## Example Invocation

```
/gtm-analytics-audit
```

or naturally:

```
Audit my site for tracking opportunities
```

---

## Example Output

```
=== GTM Analytics Audit Complete ===

Framework: Next.js 16.1.6 (App Router)
Files Scanned: 47 files
Components Analyzed: 23 components

--- Summary ---
Total Clickable Elements: 47
✓ With Tracking: 15 (31.9%)
✗ Without Tracking: 32 (68.1%)

--- Element Breakdown ---
CTAs: 12 total (4 tracked, 8 untracked)
Navigation: 8 total (2 tracked, 6 untracked)
Forms: 3 total (0 tracked, 3 untracked)
Outbound Links: 5 total (1 tracked, 4 untracked)
Media: 2 total (0 tracked, 2 untracked)

--- Key Issues ---
⚠ 23 elements with generic/missing identifiers
⚠ 8 high-priority CTAs without tracking
⚠ 3 forms without tracking
⚠ Inconsistent tracking patterns

--- Existing Tracking ---
✓ Google Tag Manager detected
✓ 15 dataLayer.push() calls found
△ Coverage: 31.9% of clickable elements

--- Recommendations ---

P0 (Critical):
1. Standardize DOM identifiers across 47 elements
   → Invoke gtm-dom-standardization skill
2. Implement tracking on 12 CTAs
   → Critical for conversion funnel visibility

P1 (Important):
3. Add form tracking (3 forms)
   → Capture lead generation and form abandonment

P2 (Nice-to-have):
4. Track outbound links (5 links)
   → Measure partner/resource engagement

--- Next Steps ---
✓ Audit report saved to: audit-report.json
→ Next: Invoke gtm-dom-standardization to prepare DOM for tracking
→ Then: Invoke gtm-strategy to plan tracking implementation
```

---

## Example audit-report.json (truncated)

```json
{
  "metadata": {
    "auditDate": "2026-02-11T10:30:00Z",
    "framework": "Next.js 16.1.6 (App Router)",
    "filesScanned": 47,
    "componentsAnalyzed": 23
  },
  "summary": {
    "totalClickableElements": 47,
    "withTracking": 15,
    "withoutTracking": 32,
    "analyticsReadiness": "42%"
  },
  "categorized": {
    "cta": {
      "total": 12,
      "tracked": 4,
      "untracked": 8,
      "elements": [
        {
          "file": "app/page.tsx",
          "line": 45,
          "text": "Get Started",
          "id": null,
          "classes": ["btn", "primary"],
          "tracking": false,
          "recommendation": "Add id='cta_hero_get_started' and classes='js-track js-cta js-click js-hero'"
        }
      ]
    }
  }
}
```
