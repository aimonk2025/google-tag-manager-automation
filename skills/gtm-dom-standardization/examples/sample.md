# GTM DOM Standardization - Example Output

This shows the expected output format when you invoke `/gtm-dom-standardization` on a React/Next.js codebase.

---

## Example Invocation

```
/gtm-dom-standardization
```

or naturally:

```
Standardize my DOM for analytics tracking
```

---

## Example: Before and After

### Before standardization

```jsx
// components/Hero.tsx
<button className="btn primary" onClick={handleClick}>
  Get Started
</button>

<a href="/pricing" className="link">
  See Pricing
</a>
```

### After standardization

```jsx
// components/Hero.tsx
<button
  id="cta_hero_get_started"
  className="btn primary js-track js-cta js-click js-hero"
  onClick={handleClick}
>
  Get Started
</button>

<a
  href="/pricing"
  id="nav_hero_pricing"
  className="link js-track js-nav js-click js-hero"
>
  See Pricing
</a>
```

---

## Example Console Output

```
=== GTM DOM Standardization Complete ===

Framework: Next.js 16.1.6 (App Router)
Files Modified: 12
Elements Standardized: 47

--- Changes Applied ---

CTAs (12 elements):
✓ app/page.tsx:45 - Added id="cta_hero_get_started" + analytics classes
✓ app/page.tsx:78 - Added id="cta_hero_start_trial" + analytics classes
✓ components/Pricing.tsx:23 - Added id="cta_pricing_choose_plan" + analytics classes
... (9 more)

Navigation (8 elements):
✓ components/Navbar.tsx:12 - Added id="nav_header_home" + analytics classes
✓ components/Navbar.tsx:18 - Added id="nav_header_pricing" + analytics classes
... (6 more)

Forms (3 elements):
✓ components/ContactForm.tsx:5 - Added id="form_contact_main" + analytics classes
... (2 more)

--- Naming Convention Applied ---
IDs:   {category}_{location}_{descriptor}
       Example: cta_hero_get_started

Classes: js-track js-{category} js-{action} js-{location}
         Example: js-track js-cta js-click js-hero

--- Files Modified ---
app/page.tsx
components/Navbar.tsx
components/Hero.tsx
components/Pricing.tsx
components/ContactForm.tsx
... (7 more)

--- Next Steps ---
✓ DOM standardization complete
→ Next: Invoke gtm-strategy to plan tracking implementation
→ Then: Invoke gtm-implementation to add dataLayer events
```

---

## Naming Convention Reference

| Category | ID Pattern | Class Pattern |
|----------|-----------|---------------|
| CTA | `cta_{location}_{action}` | `js-track js-cta js-click js-{location}` |
| Navigation | `nav_{location}_{destination}` | `js-track js-nav js-click js-{location}` |
| Form | `form_{location}_{type}` | `js-track js-form js-submit js-{location}` |
| Outbound | `outbound_{location}_{dest}` | `js-track js-outbound js-click js-{location}` |
| Media | `video_{location}_{title}` | `js-track js-media js-play js-{location}` |
