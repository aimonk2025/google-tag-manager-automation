# GTM Reporting Documentation Template

Claude fills in this template to generate stakeholder-ready documentation from your implementation.

---

## Event Schema Reference

**File**: `docs/event-schema.md`

```markdown
# Event Schema Reference

Generated: {DATE}
GTM Container: {CONTAINER_ID} | Version: {VERSION}

## {event_name}

{Description of what this event tracks and when it fires.}

| Parameter | Type | Required | Example | Source |
|-----------|------|----------|---------|--------|
| param_one | string | yes | "value" | DOM attribute |
| param_two | string | no | "value" | CSS class |

**GA4 Report**: Engagement > Events > {event_name}
**Business Value**: {What decisions this event enables.}
**GTM Tag**: {tag_name}
**GTM Trigger**: {trigger_name}
```

---

## Implementation Summary

**File**: `docs/implementation-summary.md`

```markdown
# GTM Implementation Summary

Date: {DATE}
Framework: {FRAMEWORK}
GTM Container: {CONTAINER_ID}

## Events Implemented

| Event | Elements | Status |
|-------|---------|--------|
| cta_click | {N} | ✓ Live |
| form_submit | {N} | ✓ Live |
| form_start | {N} | ✓ Live |
| navigation_click | {N} | ✓ Live |
| video_play | {N} | ✓ Live |

## GTM Configuration

- Data Layer Variables: {N}
- Custom Event Triggers: {N}
- GA4 Event Tags: {N}
- Container Version: {VERSION}

## Files Modified

{List of source files with dataLayer events added}
```

---

## Reporting Capabilities

**File**: `docs/reporting-capabilities.md`

```markdown
# Reporting Capabilities

## GA4 Standard Reports (now populated)

- Engagement > Events: {list of events}
- Acquisition: Campaign attribution via CTA clicks

## GA4 Explorations to Build

### Conversion Funnel
Steps: Page View → CTA Click → Form Submit → Thank You Page
Business Value: Identify drop-off points in conversion path

### User Journey Path
Steps: Entry → Navigation → CTA → Conversion
Business Value: Understand common paths to conversion

## Custom Dashboards

### CTA Performance Dashboard
Metrics:
- CTA clicks by location
- CTA clicks by text
- CTA-to-form conversion rate

### Lead Generation Report
Metrics:
- Form submissions by type
- Form abandonment rate
- Time to complete
```

---

## Executive Summary

**File**: `docs/executive-summary.md`

```markdown
# Analytics Implementation: Executive Summary

## What Was Implemented

{N} tracking events now capture user interactions across {N} key touchpoints on {SITE}.

## Business Capabilities Unlocked

### Conversion Visibility
We can now see exactly which CTAs drive signups and form submissions.

### Funnel Analysis
Full visibility from first visit through lead capture.

### Campaign ROI
Track which marketing campaigns drive the most qualified leads.

## Expected Business Impact

- {Specific metric improvement expected}
- {Specific decision that can now be made with data}

## Next Steps for Stakeholders

1. Review the Conversion Funnel report in GA4 after 2 weeks of data
2. Use CTA Performance data to A/B test button copy
3. Monitor form abandonment rate to identify UX improvements
```

---

## Audience Definitions

**File**: `docs/audience-definitions.md`

```markdown
# Remarketing Audience Definitions

## {Audience Name}

**Criteria**: {GA4 segment definition}
**Estimated size**: {X}% of traffic
**Retention period**: {N} days

**Use cases**:
- {Campaign type} targeting this segment
- {Ad platform}: {Estimated CPL improvement}

**How to create in GA4**:
Admin > Audiences > New Audience > {steps}
```
