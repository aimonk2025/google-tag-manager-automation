# GTM Tracking Plan Template

Use this template to capture business context before generating the tracking plan JSON.

---

## Business Context

**Site URL**: _______________
**Business Model**: [ ] SaaS  [ ] E-commerce  [ ] Lead Generation  [ ] Content/Publishing
**Primary Goal**: _______________

---

## Trackable Elements Found

| Category | Count | Priority |
|----------|-------|----------|
| CTAs | ___ | P0 |
| Forms | ___ | P0 |
| Navigation | ___ | P1 |
| Video/Media | ___ | P1 |
| Outbound Links | ___ | P2 |

---

## Prioritised Events

### P0 - Critical (implement first)

| Event Name | Elements | Business Value | Decision Impact |
|-----------|---------|----------------|-----------------|
| cta_click | ___ | ___ | ___ |
| form_submit | ___ | ___ | ___ |
| form_start | ___ | ___ | ___ |

### P1 - Important

| Event Name | Elements | Business Value | Decision Impact |
|-----------|---------|----------------|-----------------|
| navigation_click | ___ | ___ | ___ |
| video_play | ___ | ___ | ___ |

### P2 - Nice to have

| Event Name | Elements | Business Value | Decision Impact |
|-----------|---------|----------------|-----------------|
| outbound_click | ___ | ___ | ___ |

---

## Event Parameter Schema

### cta_click

| Parameter | Type | Source | Example |
|-----------|------|--------|---------|
| cta_location | string | DOM id prefix | "hero" |
| cta_type | string | CSS class | "primary" |
| cta_text | string | innerText | "Get Started" |
| cta_destination | string | href | "/signup" |

### form_submit / form_start

| Parameter | Type | Source | Example |
|-----------|------|--------|---------|
| form_name | string | form id | "contact_main" |
| form_location | string | DOM id prefix | "footer" |
| form_type | string | field inference | "email_capture" |

---

## Recommended GA4 Reports

- [ ] Conversion Funnel: Page View → CTA Click → Form Submit → Thank You
- [ ] CTA Performance Dashboard
- [ ] Lead Generation Report (form completion rate, abandonment)
- [ ] Navigation Paths

---

## Remarketing Audiences

| Audience | Criteria | Estimated Size | Use Case |
|---------|---------|----------------|----------|
| High-Intent | Pricing CTA click OR form submit (7 days) | 5-10% | Retarget with case studies |
| Demo Requesters | "Book Demo" click OR demo form submit | 1-3% | Sales team follow-up |

---

## Output File

Claude will generate `gtm-tracking-plan.json` based on this template.
