# Analytics Naming Conventions

This document defines standard naming conventions for analytics-ready DOM identifiers.

## Core Principles

1. **Descriptive over generic**: `cta_hero_get_started` not `button1`
2. **Consistent structure**: Follow patterns religiously
3. **Analytics-first**: IDs/classes optimized for tracking, not just styling
4. **Human-readable**: Developers and marketers should understand intent

## ID Naming Convention

Use IDs for unique, high-priority elements that need precise tracking.

### Pattern

```
{category}_{location}_{action/descriptor}
```

### Categories

- `cta` - Call-to-action buttons
- `nav` - Navigation links
- `form` - Forms and inputs
- `video` - Video players
- `audio` - Audio players
- `download` - Download links
- `outbound` - External links

### Locations

- `hero` - Hero section
- `header` - Site header
- `footer` - Site footer
- `sidebar` - Sidebar
- `modal` - Modal/dialog
- `pricing` - Pricing page/section
- `navbar` - Navigation bar
- Page-specific: `homepage`, `about_page`, `pricing_page`

### Examples

```html
<!-- CTAs -->
<button id="cta_hero_get_started">Get Started</button>
<button id="cta_pricing_start_trial">Start Free Trial</button>
<button id="cta_modal_confirm_signup">Confirm Sign Up</button>

<!-- Navigation -->
<a id="nav_header_pricing">Pricing</a>
<a id="nav_footer_about">About Us</a>

<!-- Forms -->
<form id="form_footer_newsletter">...</form>
<form id="form_hero_contact">...</form>

<!-- Media -->
<video id="video_hero_product_demo">...</video>

<!-- Outbound -->
<a id="outbound_footer_twitter">Twitter</a>
```

## Class Naming Convention

Use classes for all trackable elements. Classes enable bulk selection and category-based tracking.

### Pattern

```
js-track js-{category} js-{action} js-{location}
```

### Core Classes

- `js-track` - Base class for ALL tracked elements (required)
- `js-{category}` - Element category (required)
- `js-{action}` - Interaction type (required)
- `js-{location}` - Page location (optional but recommended)

### Categories (js-{category})

- `js-cta` - Call-to-action
- `js-nav` - Navigation
- `js-form` - Form
- `js-pricing` - Pricing element
- `js-auth` - Authentication
- `js-demo` - Demo request
- `js-outbound` - External link
- `js-media` - Video/audio
- `js-download` - File download

### Actions (js-{action})

- `js-click` - Click events
- `js-submit` - Form submission
- `js-open` - Open modal/dialog
- `js-close` - Close modal/dialog
- `js-play` - Media play
- `js-pause` - Media pause
- `js-download` - File download
- `js-expand` - Expand/collapse

### Locations (js-{location})

- `js-hero` - Hero section
- `js-header` - Header
- `js-footer` - Footer
- `js-sidebar` - Sidebar
- `js-modal` - Modal
- `js-pricing` - Pricing section
- `js-navbar` - Navbar

### Examples

```html
<!-- CTA Button -->
<button
  class="btn btn-primary js-track js-cta js-click js-hero"
  id="cta_hero_get_started"
>
  Get Started
</button>

<!-- Navigation Link -->
<a
  href="/pricing"
  class="nav-link js-track js-nav js-click js-header"
  id="nav_header_pricing"
>
  Pricing
</a>

<!-- Form -->
<form
  class="newsletter-form js-track js-form js-submit js-footer"
  id="form_footer_newsletter"
>
  ...
</form>

<!-- Video -->
<video
  class="hero-video js-track js-media js-play js-hero"
  id="video_hero_product_demo"
>
  ...
</video>

<!-- Outbound Link -->
<a
  href="https://twitter.com/company"
  target="_blank"
  class="social-link js-track js-outbound js-click js-footer"
  id="outbound_footer_twitter"
>
  Twitter
</a>
```

## Visual Classes Preservation

**CRITICAL**: Analytics classes are ADDITIVE. Never remove existing visual styling classes.

### Before (Original)

```html
<button class="btn btn-lg btn-primary rounded-lg shadow-md">
  Get Started
</button>
```

### After (Analytics-Ready)

```html
<button
  class="btn btn-lg btn-primary rounded-lg shadow-md js-track js-cta js-click js-hero"
  id="cta_hero_get_started"
>
  Get Started
</button>
```

**Rule**: Append analytics classes, never replace styling classes.

## Framework-Specific Syntax

### React/Next.js

```jsx
<button
  className="btn primary js-track js-cta js-click js-hero"
  id="cta_hero_get_started"
>
  Get Started
</button>
```

### Vue

```vue
<button
  :class="['btn', 'primary', 'js-track', 'js-cta', 'js-click', 'js-hero']"
  id="cta_hero_get_started"
>
  Get Started
</button>
```

### HTML

```html
<button
  class="btn primary js-track js-cta js-click js-hero"
  id="cta_hero_get_started"
>
  Get Started
</button>
```

## Decision Trees for Ambiguous Elements

### "Learn More" Button

```
Is it the primary CTA on the page?
├─ Yes → js-cta js-click
└─ No → js-nav js-click
```

### "Contact Us" Element

```
Where is it located?
├─ Navbar/Footer → js-nav js-click
├─ Hero/Prominent → js-cta js-click
└─ Content area → js-cta js-click (default)
```

### Video Player

```
What's the purpose?
├─ Product demo → js-demo js-play + js-media
├─ Background video → js-media js-play
└─ Educational content → js-media js-play
```

### Form Submit Button

```
Is it inside a <form>?
├─ Yes → js-form js-submit
└─ No → js-cta js-click (if it triggers form programmatically)
```

## Common Patterns

### Primary CTA (Hero)

```html
<button
  className="btn-primary js-track js-cta js-click js-hero"
  id="cta_hero_get_started"
>
  Get Started
</button>
```

### Secondary CTA (Hero)

```html
<button
  className="btn-secondary js-track js-cta js-click js-hero"
  id="cta_hero_watch_demo"
>
  Watch Demo
</button>
```

### Navigation Link

```html
<Link
  href="/pricing"
  className="nav-link js-track js-nav js-click js-header"
  id="nav_header_pricing"
>
  Pricing
</Link>
```

### Newsletter Form

```html
<form
  className="form js-track js-form js-submit js-footer"
  id="form_footer_newsletter"
  onSubmit={handleSubmit}
>
  <input type="email" name="email" />
  <button type="submit">Subscribe</button>
</form>
```

### Pricing Plan CTA

```html
<button
  className="pricing-cta js-track js-pricing js-click js-pricing"
  id="cta_pricing_choose_pro"
>
  Choose Pro Plan
</button>
```

### Social Media Link

```html
<a
  href="https://twitter.com/company"
  target="_blank"
  className="social-icon js-track js-outbound js-click js-footer"
  id="outbound_footer_twitter"
>
  <TwitterIcon />
</a>
```

## Anti-Patterns (Avoid These)

### ❌ Generic IDs

```html
<button id="button1">Get Started</button>
<button id="btn">Sign Up</button>
<button id="primary">Learn More</button>
```

### ❌ Replacing Visual Classes

```html
<!-- WRONG: Removed styling classes -->
<button class="js-track js-cta js-click">Get Started</button>

<!-- RIGHT: Preserved styling classes -->
<button class="btn btn-primary js-track js-cta js-click">Get Started</button>
```

### ❌ Missing js-track Base Class

```html
<!-- WRONG: No js-track -->
<button class="js-cta js-click">Get Started</button>

<!-- RIGHT: Includes js-track -->
<button class="js-track js-cta js-click">Get Started</button>
```

### ❌ Inconsistent Naming

```html
<!-- WRONG: Inconsistent patterns -->
<button id="heroGetStarted">Get Started</button>
<button id="footer_cta_signup">Sign Up</button>
<button id="learn-more-pricing">Learn More</button>

<!-- RIGHT: Consistent pattern -->
<button id="cta_hero_get_started">Get Started</button>
<button id="cta_footer_signup">Sign Up</button>
<button id="cta_pricing_learn_more">Learn More</button>
```

## Best Practices

1. **Start with js-track**: Every tracked element must have `js-track` class
2. **Be specific**: Use all 4 parts (js-track + category + action + location)
3. **Use IDs for unique elements**: Primary CTAs, important forms
4. **Use classes for bulk tracking**: All elements in a category
5. **Preserve existing classes**: Never remove visual styling classes
6. **Be consistent**: Follow patterns across entire codebase
7. **Think business impact**: Prioritize high-value elements for IDs

## Quick Reference

### ID Template
```
{category}_{location}_{descriptor}
```

### Class Template
```
js-track js-{category} js-{action} js-{location}
```

### Categories
CTA, Nav, Form, Pricing, Auth, Demo, Outbound, Media, Download

### Actions
Click, Submit, Open, Close, Play, Pause, Download, Expand

### Locations
Hero, Header, Footer, Sidebar, Modal, Navbar, Pricing, {page}_page
