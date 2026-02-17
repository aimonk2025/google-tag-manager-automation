# GTM Reporting - Example Output

This shows the expected output when you invoke `/gtm-reporting` to generate documentation and reporting impact analysis.

---

## Example Invocation

```
/gtm-reporting
```

or naturally:

```
Document my GTM implementation
What reports can I build from my tracking?
Generate a stakeholder summary of my analytics
Create event schema documentation
```

---

## Example Console Output

```
=== GTM Reporting & Documentation ===

Loading implementation artifacts...
✓ gtm-tracking-plan.json found (5 events)
✓ audit-report.json found
✓ GTM container: Version 3 (5 tags, 5 triggers, 13 variables)

--- Generating Documentation ---

✓ event-schema.md - Complete event parameter reference
✓ implementation-summary.md - Technical implementation notes
✓ reporting-capabilities.md - GA4 reports now available
✓ audience-definitions.md - Remarketing segments
✓ executive-summary.md - Business stakeholder summary

--- Reporting Capabilities Unlocked ---

GA4 Standard Reports (now populated):
✓ Engagement > Events - All 5 custom events visible
✓ Acquisition - Campaign attribution via CTA clicks

GA4 Explorations you can build:
✓ Conversion Funnel: Page View → CTA Click → Form Submit → Signup
✓ User Journey: Navigation paths from entry to conversion
✓ Cohort: Users who completed form in first session

Custom Dashboards:
✓ CTA Performance: Clicks by location, type, conversion rate
✓ Lead Generation: Form submissions, abandonment rate
✓ Video Engagement: Play rate, completion rate

--- Remarketing Audiences Defined ---
✓ High-Intent Visitors (est. 5-10% of traffic)
  → Criteria: Pricing CTA click OR form submission in last 7 days
  → Use: Retarget with case studies and social proof

✓ Demo Requesters (est. 1-3% of traffic)
  → Criteria: "Book Demo" CTA OR demo form submission
  → Use: High-value segment for sales team follow-up

--- Executive Summary ---
5 tracking events implemented covering 29 interactive elements.
Primary benefit: Full visibility into lead generation funnel from
first CTA click through form submission. Enables data-driven
decisions on CTA placement, form optimization, and campaign ROI.

--- Files Generated ---
✓ docs/event-schema.md
✓ docs/implementation-summary.md
✓ docs/reporting-capabilities.md
✓ docs/audience-definitions.md
✓ docs/executive-summary.md

→ Next: Publish GTM container via gtm-testing skill
→ Share executive-summary.md with stakeholders
```

---

## Example: event-schema.md (excerpt)

```markdown
# Event Schema Reference

## cta_click

Fires when a user clicks a call-to-action button.

| Parameter | Type | Required | Example | Source |
|-----------|------|----------|---------|--------|
| cta_location | string | yes | "hero" | DOM id prefix |
| cta_type | string | no | "primary" | CSS class |
| cta_text | string | yes | "Start Free Trial" | Button innerText |
| cta_destination | string | yes | "/signup" | href attribute |

**GA4 Report**: Engagement > Events > cta_click
**Business Value**: Measures conversion intent. Use for CTA A/B testing.
```
