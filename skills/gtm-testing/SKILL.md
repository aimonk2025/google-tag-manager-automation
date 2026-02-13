---
name: gtm-testing
description: Comprehensive GTM tracking testing and validation including browser console testing, GTM Preview mode validation, GA4 DebugView verification, and automated test generation. Use when users need to "test GTM tracking", "validate dataLayer events", "debug GTM", "check if tracking works", "test in Preview mode", or troubleshoot tracking issues. Provides interactive testing guidance and generates Playwright/Cypress automated tests.
---

# GTM Testing - Validation & Debugging

Guide users through comprehensive testing of GTM tracking implementation using a three-tier validation approach.

## Testing Philosophy

**Tier 1**: Browser Console (dataLayer verification)
**Tier 2**: GTM Preview Mode (tag firing verification)
**Tier 3**: GA4 DebugView (end-to-end verification)

Each tier validates different aspects. All three must pass for complete validation.

## Workflow

### Phase 1: Preparation

**Step 1.1: Load Implementation Context**
```
Check for gtm-implementation-log.json (from gtm-implementation skill):
- If exists → Load events that were implemented
- If missing → Ask user which events to test

Generate custom test plan based on implemented events.
```

**Step 1.2: Start Development Server**
```
Verify dev server is running:
- Check if localhost:3000 (or configured port) is accessible
- If not running → Guide user to start: npm run dev

Why: Testing requires live site to interact with elements
```

**Step 1.3: Open Browser DevTools**
```
Guide user:
1. Open site in browser (Chrome recommended)
2. Open DevTools: F12 or Cmd+Option+I (Mac) / Ctrl+Shift+I (Windows)
3. Go to Console tab
4. Clear console: Ctrl+L or Cmd+K
```

### Phase 2: Tier 1 - Browser Console Testing (DataLayer)

Test that dataLayer.push() events fire correctly.

**Step 2.1: Check DataLayer Exists**
```
In browser console, type:
window.dataLayer

Expected output:
[{...}, {...}, ...]  ← Array of events

If undefined:
→ Error: GTM not installed or dataLayer not initialized
→ Check that GTM container snippet is in <head>
```

**Step 2.2: Monitor DataLayer in Real-Time**
```
In console, run:
window.dataLayer.push = new Proxy(window.dataLayer.push, {
  apply: function(target, thisArg, argumentsList) {
    console.log('📊 DataLayer Push:', argumentsList[0])
    return target.apply(thisArg, argumentsList)
  }
})

This logs every dataLayer.push() call in console.
```

**Step 2.3: Test Each Event**

For each implemented event, provide specific testing instructions:

**Example: CTA Click Event**
```
Test: CTA Click Event

1. Click the "Get Started" button in hero section
2. Check console for:

Expected output:
📊 DataLayer Push: {
  event: "cta_click",
  cta_location: "hero",
  cta_type: "primary",
  cta_text: "Get Started",
  cta_destination: "/signup"
}

✓ Pass: All parameters present and correct
✗ Fail: Event missing or parameters wrong
```

**Example: Form Submit Event**
```
Test: Form Submit Event

1. Fill out newsletter form in footer
2. Click "Subscribe" button
3. Check console for:

Expected output:
📊 DataLayer Push: {
  event: "form_submit",
  form_name: "newsletter",
  form_location: "footer",
  form_type: "email_capture"
}

✓ Pass: Event fires on submit with correct parameters
✗ Fail: Event doesn't fire or parameters missing
```

**Step 2.4: Validation Checklist**
```
Browser Console Validation:

[ ] dataLayer exists (window.dataLayer is defined)
[ ] CTA click events fire with all parameters
[ ] Form submit events fire with correct form data
[ ] Navigation click events fire on link clicks
[ ] Video events fire on play/pause (if applicable)
[ ] Parameters match expected values (location, type, text, etc.)
[ ] No duplicate events (event fires once per action)
[ ] No JavaScript errors in console

If all pass → Continue to Tier 2 (GTM Preview)
If any fail → Debug issues before proceeding
```

### Phase 3: Tier 2 - GTM Preview Mode (Tag Firing)

Test that GTM tags fire correctly in response to dataLayer events.

**Step 3.1: Enable GTM Preview Mode**
```
Guide user:
1. Go to Google Tag Manager: https://tagmanager.google.com
2. Select your container (GTM-XXXXXX)
3. Click "Preview" button in top right
4. Enter your site URL (e.g., http://localhost:3000)
5. Click "Connect"

Expected: New tab opens with your site + GTM Preview panel at bottom
```

**Step 3.2: Test Event → Trigger → Tag Flow**

For each event, verify the complete flow:

**Example: CTA Click Event**
```
Test: CTA Click → Tag Firing

1. In Preview mode, ensure "Tag Assistant Connected" shows
2. Click "Get Started" button on site
3. In Preview panel, check "Summary" tab

Expected flow:
Event → Custom Event "CE - CTA Click" → Tag "GA4 - CTA Click"

Verification:
1. Event section shows "cta_click" custom event
2. Triggers section shows "CE - CTA Click" (Fired)
3. Tags section shows "GA4 - CTA Click" (Fired)

✓ Pass: Event → Trigger → Tag all fire
✗ Fail: Any step not firing
```

**Step 3.3: Verify Tag Parameters**
```
In Preview panel:
1. Click on fired "GA4 - CTA Click" tag
2. Go to "Event Parameters" tab

Expected parameters in GA4 tag:
- event_name: cta_click
- cta_location: hero
- cta_type: primary
- cta_text: Get Started
- cta_destination: /signup

✓ Pass: All parameters present in GA4 tag
✗ Fail: Missing parameters or wrong values
```

**Step 3.4: Validation Checklist**
```
GTM Preview Mode Validation:

[ ] Preview mode connects successfully
[ ] Custom events appear in event list
[ ] Triggers fire in response to events
[ ] Tags fire when triggers activate
[ ] Tag parameters match dataLayer parameters
[ ] GA4 Configuration tag fires on page load
[ ] No tags firing unexpectedly
[ ] No trigger errors shown

If all pass → Continue to Tier 3 (GA4 DebugView)
If any fail → Debug in GTM before proceeding
```

### Phase 4: Tier 3 - GA4 DebugView (End-to-End)

Test that events reach GA4 and appear correctly in reports.

**Step 4.1: Enable GA4 Debug Mode**
```
Two options to enable debug mode:

Option A (Chrome Extension):
1. Install "Google Analytics Debugger" extension
2. Click extension icon to enable
3. Page should reload

Option B (URL Parameter):
1. Add ?debug_mode=true to URL
2. Example: http://localhost:3000?debug_mode=true

Verification:
Events will now appear in GA4 DebugView (not regular reports)
```

**Step 4.2: Open GA4 DebugView**
```
Guide user:
1. Go to GA4: https://analytics.google.com/
2. Select your property
3. Go to "Admin" (bottom left)
4. Under "Property", click "DebugView"

Expected: Real-time event stream showing events from your site
```

**Step 4.3: Test Events in DebugView**

**Example: CTA Click Event**
```
Test: CTA Click in GA4

1. With DebugView open, click "Get Started" button on site
2. Wait 1-3 seconds for event to appear
3. Look for "cta_click" in event stream

Expected in DebugView:
Event name: cta_click
Event parameters:
  - cta_location: hero
  - cta_type: primary
  - cta_text: Get Started
  - cta_destination: /signup

Device: Your computer/browser
Page: /

✓ Pass: Event appears with all parameters
✗ Fail: Event missing or parameters wrong
```

**Step 4.4: Verify Event Count**
```
In DebugView:
- Event stream shows real-time events
- "Event count by Event name" shows totals

Test: Click same button 3 times

Expected:
"cta_click" event count increases to 3

✓ Pass: Each click creates new event
✗ Fail: Multiple clicks don't register
```

**Step 4.5: Validation Checklist**
```
GA4 DebugView Validation:

[ ] Debug mode enabled (DebugView shows events)
[ ] CTA click events appear in real-time
[ ] Form submit events appear with correct parameters
[ ] Navigation events appear on link clicks
[ ] All event parameters visible in DebugView
[ ] Event counts increment correctly
[ ] No unexpected events firing
[ ] Events associated with correct page paths

If all pass → Tracking validated end-to-end ✓
If any fail → Debug before publishing GTM container
```

### Phase 5: Common Issues & Debugging

Provide troubleshooting for common problems:

**Issue: dataLayer is undefined**
```
Cause: GTM container snippet not installed

Solution:
1. Check <head> tag has GTM snippet
2. Verify GTM container ID is correct (GTM-XXXXXX)
3. Check GTM container is published (not just in Preview)
4. Clear browser cache and reload
```

**Issue: Event fires but trigger doesn't activate**
```
Cause: Trigger condition doesn't match event

Debug:
1. In GTM Preview, click failed trigger
2. Check "Conditions" tab
3. Verify event name matches exactly (case-sensitive)

Fix:
- Event name in code: "cta_click"
- Trigger condition: {{Event}} equals "cta_click"
- Must match exactly (no "CTA_CLICK" or "cta_Click")
```

**Issue: Trigger fires but tag doesn't**
```
Cause: Tag configuration error

Debug:
1. In GTM Preview, click tag that didn't fire
2. Check "Errors" or "Not Fired" status
3. Review tag configuration

Common fixes:
- Ensure GA4 Configuration tag exists
- Check GA4 Measurement ID is correct
- Verify tag is assigned to trigger
- Check tag doesn't have blocking exception rules
```

**Issue: Event appears in Preview but not DebugView**
```
Cause: Debug mode not enabled OR wrong GA4 property

Debug:
1. Confirm ?debug_mode=true in URL
2. Verify GA4 Measurement ID in GTM matches DebugView property
3. Wait 10-15 seconds (events can be delayed)
4. Check browser console for GA4 errors

Fix:
- Enable debug mode properly
- Use correct GA4 property
- Publish GTM container (not just preview)
```

**Issue: Parameters missing in GA4**
```
Cause: Parameters not mapped in GA4 tag

Debug:
1. In GTM, open "GA4 - CTA Click" tag
2. Check "Event Parameters" section
3. Verify each parameter is mapped:
   - Parameter Name: cta_location
   - Value: {{DLV - CTA Location}}

Fix:
- Add missing parameter mappings
- Ensure Data Layer Variables exist
- Check variable names match exactly
```

### Phase 6: Testing Summary Report

After all testing complete, generate summary:

```
=== GTM Tracking Testing Complete ===

--- Tier 1: Browser Console (DataLayer) ---
✓ dataLayer exists and initialized
✓ CTA click events fire (12/12 tested)
✓ Form submit events fire (3/3 tested)
✓ Navigation click events fire (8/8 tested)
✓ All parameters present and correct
✓ No JavaScript errors

Status: PASS ✓

--- Tier 2: GTM Preview Mode (Tags) ---
✓ Preview mode connected successfully
✓ Custom events trigger correctly (3/3)
✓ Tags fire in response to triggers (3/3)
✓ Tag parameters match dataLayer
✓ GA4 Configuration tag fires

Status: PASS ✓

--- Tier 3: GA4 DebugView (End-to-End) ---
✓ Debug mode enabled
✓ Events appear in DebugView (3/3)
✓ All event parameters visible
✓ Event counts increment correctly
✓ Events on correct pages

Status: PASS ✓

=== Overall Testing Status: PASS ✓ ===

All 3 tiers validated successfully.

--- Next Steps ---
1. Publish GTM container:
   → GTM → Submit → Publish

2. Disable debug mode for production

3. Monitor events in GA4 Reports (not DebugView):
   → Reports → Engagement → Events

4. Generate documentation:
   → Invoke gtm-reporting skill

Ready to document implementation? Invoke gtm-reporting skill.
```

## References

### references/debugging-guide.md
Common GTM issues and solutions with step-by-step debugging

### references/test-checklist.md
Printable testing checklist template

## Important Guidelines

### Testing Best Practices

**1. Test Incrementally**
- Test each event individually
- Don't test all events at once
- Isolate issues to specific events

**2. Clear Cache Between Tests**
- Hard refresh: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
- Clears cached GTM container
- Ensures latest configuration loads

**3. Wait for Propagation**
- GTM changes take 1-2 minutes to propagate to Preview
- GA4 DebugView events can have 1-3 second delay
- Be patient between changes and testing

**4. Document Failures**
- Screenshot console errors
- Note which specific elements fail
- Track error messages for debugging

### Testing Workflow

**Iterative Testing Loop**:
```
1. Implement tracking (gtm-implementation)
2. Test in console (Tier 1)
   → If fail: Fix code, repeat
3. Test in GTM Preview (Tier 2)
   → If fail: Fix GTM config, repeat
4. Test in GA4 DebugView (Tier 3)
   → If fail: Fix GA4 config, repeat
5. All pass → Publish & document
```

**Don't Skip Tiers**:
- Tier 1 failure = don't test Tier 2 yet
- Tier 2 failure = don't test Tier 3 yet
- Fix issues at lowest tier first

### User Interaction

**Guide Interactively**:
```
"I'll guide you through testing the CTA click event.

Step 1: Open your site in Chrome
Step 2: Open DevTools (press F12)
Step 3: Click the 'Get Started' button

Did you see the dataLayer event in console? (yes/no)"

[Wait for user response]

If yes → "Great! Let's move to GTM Preview..."
If no → "Let's debug. Can you share what you see in console?"
```

**Confirm Each Step**:
- Don't assume tests pass
- Ask user to confirm results
- Wait for user input before proceeding

## Execution Checklist

- [ ] Implementation context loaded
- [ ] Development server running
- [ ] Browser DevTools opened
- [ ] Tier 1: dataLayer events validated
- [ ] Tier 2: GTM Preview mode validated
- [ ] Tier 3: GA4 DebugView validated
- [ ] Common issues addressed
- [ ] Testing summary generated
- [ ] Publishing instructions provided

## Common Questions

**Q: Do I need to test every single element?**
A: Test 1-2 examples of each event type. If "cta_click" works for one button, it should work for all CTAs.

**Q: How long does it take to test everything?**
A: 15-30 minutes for comprehensive testing across all 3 tiers.

**Q: Can I skip GTM Preview and just test in GA4?**
A: No. GTM Preview helps debug tag firing issues. Skipping it makes debugging harder.

**Q: What if events work in Preview but not after publishing?**
A: Clear cache and wait 5 minutes for GTM container to propagate. Published container can take time to update.

**Q: Do I need to test in different browsers?**
A: DataLayer events work across all browsers. Test in one browser (Chrome recommended) for validation.
