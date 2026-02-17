# GTM Implementation - Example Output

This shows the expected output when you invoke `/gtm-implementation` to add tracking to your codebase and GTM container.

---

## Example Invocation

```
/gtm-implementation
```

or naturally:

```
Implement GTM tracking from my tracking plan
Add dataLayer events to my site
Create GTM tags for my tracking plan
```

---

## Example Code Change (Next.js)

### Before

```tsx
// components/Hero.tsx
<button
  id="cta_hero_get_started"
  className="btn primary js-track js-cta js-click js-hero"
  onClick={handleClick}
>
  Get Started
</button>
```

### After

```tsx
// components/Hero.tsx
'use client';

<button
  id="cta_hero_get_started"
  className="btn primary js-track js-cta js-click js-hero"
  onClick={() => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'cta_click',
      cta_location: 'hero',
      cta_type: 'primary',
      cta_text: 'Get Started',
      cta_destination: '/signup',
    });
    handleClick();
  }}
>
  Get Started
</button>
```

---

## Example Console Output

```
=== GTM Implementation ===

Loading tracking plan from gtm-tracking-plan.json...
✓ 5 events to implement: cta_click, form_submit, form_start, navigation_click, video_play
✓ 29 elements to track

--- Phase 1: DataLayer Implementation ---

Implementing cta_click (12 CTAs)...
✓ components/Hero.tsx - cta_hero_get_started
✓ components/Hero.tsx - cta_hero_start_trial
✓ components/Pricing.tsx - cta_pricing_choose_plan
... (9 more CTAs)

Implementing form_submit + form_start (3 forms)...
✓ components/ContactForm.tsx - form_contact_main
✓ components/Newsletter.tsx - form_footer_newsletter
✓ app/demo/page.tsx - form_demo_request

Implementing navigation_click (8 links)...
✓ components/Navbar.tsx - nav_header_home
... (7 more)

Implementing video_play (1 video)...
✓ components/Hero.tsx - video_hero_product_demo

--- Phase 2: GTM Container Configuration ---

Creating Data Layer Variables...
✓ DL - CTA Location (dataLayer key: cta_location)
✓ DL - CTA Text (dataLayer key: cta_text)
✓ DL - CTA Destination (dataLayer key: cta_destination)
✓ DL - Form Name (dataLayer key: form_name)
✓ DL - Form Location (dataLayer key: form_location)
... (8 more variables)

Creating Custom Event Triggers...
✓ CE - CTA Click (event: cta_click)
✓ CE - Form Submit (event: form_submit)
✓ CE - Form Start (event: form_start)
✓ CE - Navigation Click (event: navigation_click)
✓ CE - Video Play (event: video_play)

Creating GA4 Event Tags...
✓ GA4 - CTA Click
✓ GA4 - Form Submit
✓ GA4 - Form Start
✓ GA4 - Navigation Click
✓ GA4 - Video Play

Creating Container Version...
✓ Version 3 created: "GTM Implementation - 5 events"

--- Implementation Summary ---
Files modified: 12
DataLayer events added: 29
GTM variables created: 13
GTM triggers created: 5
GTM tags created: 5
Container version: 3

→ Next: Invoke gtm-testing to validate all events
→ Then: Invoke gtm-reporting to document the implementation
```
