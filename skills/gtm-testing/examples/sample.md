# GTM Testing - Example Output

This shows the expected output when you invoke `/gtm-testing` to validate tracking.

---

## Example Invocation

```
/gtm-testing
```

or naturally:

```
Test my GTM tracking
Validate my dataLayer events
Run automated tracking tests
Debug why my GTM isn't firing
```

---

## Example: Tier 0 Automated Test Run

```bash
node scripts/test-tracking.js
```

### Output

```
=== GTM dataLayer Event Tests ===

Test: dataLayer initialisation
  PASS  dataLayer initialised
  PASS  GTM bootstrap event present

Test: cta_click event
  PASS  cta_click fired - location=hero

Test: form_submit event
  PASS  form_submit fired - form_name=contact_main

Test: form_start event
  PASS  form_start fired - form_name=contact_main

Test: navigation_click event
  PASS  navigation_click fired - nav_location=header

Test: video_play event
  WARN  video_hero_product_demo - component exists but not rendered on homepage

=== RESULTS ===
  Passed:   5
  Failed:   0
  Warnings: 1

Warnings:
  - video_play: Component not rendered on tested page (not a bug)
```

Exit code: `0` (all required tests passed)

---

## Example: Tier 1 Browser Console Monitor

Paste into browser console before clicking elements:

```javascript
const _push = window.dataLayer.push.bind(window.dataLayer);
window.dataLayer.push = function(...args) {
  console.log('%c dataLayer.push', 'background:#222;color:#0f0;padding:2px 6px', args[0]);
  return _push(...args);
};
```

Then click "Get Started" button. Expected console output:

```javascript
{
  event: "cta_click",
  cta_location: "hero",
  cta_type: "primary",
  cta_text: "Get Started",
  cta_destination: "/signup"
}
```

---

## Example: Common Failure and Fix

### Failure

```
  FAIL  cta_click did not fire
```

### Diagnosis

The element uses a Next.js `<Link>` which navigates before the onClick fires.

### Fix

Replace `page.click()` with `dispatchEvent` in the test script:

```javascript
await page.evaluate(() => {
  const btn = document.querySelector('#cta_hero_get_started');
  if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(400);
```
