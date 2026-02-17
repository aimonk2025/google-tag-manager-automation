# GTM Strategy - Example Output

This shows the expected output when you invoke `/gtm-strategy` on a SaaS site.

---

## Example Invocation

```
/gtm-strategy
```

or naturally:

```
Help me plan my GTM tracking strategy
What should I track on my site?
Create a tracking plan for my SaaS
```

---

## Example Console Output

```
Scanning your codebase...

Found trackable elements:
✓ 12 buttons/CTAs (using js-track js-cta classes)
✓ 8 navigation links (using js-track js-nav classes)
✓ 3 forms (using js-track js-form classes)
✓ 1 video player (using js-track js-media classes)
✓ 5 external links (using js-track js-outbound classes)

Existing tracking:
✓ 15 elements already have dataLayer.push()
✗ 17 elements missing tracking code

Framework detected: Next.js 16 (App Router)
Business model inferred: SaaS - Lead Generation

---

I found 12 CTA buttons and 3 forms in your codebase.

Q: What's your primary business goal for this site?
  a) Lead generation (capture contact info)
  b) Direct sales/conversions
  c) User engagement/retention
  d) Product trial signups

[User: a) Lead generation]

---

=== GTM Tracking Strategy Complete ===

Business Model: SaaS - Lead Generation
Primary Goal: Drive trial signups and demo requests

--- Tracking Plan Summary ---

P0 Events (Critical - Implement First):
1. cta_click (12 elements to track)
   → Why: Measures conversion intent on primary actions
   → Decision Impact: A/B test button copy, optimize placement
   → Gap: 8 CTAs missing tracking

2. form_submit (3 elements to track)
   → Why: Captures lead submissions
   → Decision Impact: Measure conversion rate, identify drop-offs
   → Gap: 0 forms currently tracked

3. form_start (3 elements to track)
   → Why: Identifies abandonment (started but didn't submit)
   → Decision Impact: Calculate abandonment rate, optimize fields

P1 Events (Implement Second):
4. navigation_click (8 elements to track)
5. video_play (1 element to track)

--- Recommended GA4 Reports ---
✓ Conversion Funnel: Page View → CTA Click → Form Submit → Signup
✓ CTA Performance Dashboard
✓ Lead Generation Report

--- Next Steps ---
✓ Tracking plan saved to: gtm-tracking-plan.json
→ Next: Invoke gtm-setup to configure GTM API access
→ Then: Invoke gtm-implementation to implement tracking
```

---

## Example gtm-tracking-plan.json (truncated)

```json
{
  "metadata": {
    "createdDate": "2026-02-11T10:30:00Z",
    "businessModel": "SaaS - Lead Generation",
    "framework": "Next.js 16.1.6 (App Router)",
    "primaryGoal": "Lead generation through trial signups and demo requests"
  },
  "events": [
    {
      "name": "cta_click",
      "priority": "P0",
      "businessValue": "Measures conversion intent on 12 primary CTAs",
      "parameters": [
        { "name": "cta_location", "type": "string", "example": "hero" },
        { "name": "cta_text", "type": "string", "example": "Start Free Trial" },
        { "name": "cta_destination", "type": "string", "example": "/signup" }
      ]
    }
  ]
}
```
