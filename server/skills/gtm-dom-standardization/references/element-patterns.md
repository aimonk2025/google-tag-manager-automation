# Element Patterns - Before & After Examples

Comprehensive examples of DOM standardization for all common element types across different frameworks.

## CTAs (Call-to-Action)

### Primary Hero CTA

**Before**:
```jsx
<button class="btn primary">Get Started</button>
```

**After**:
```jsx
<button
  className="btn primary js-track js-cta js-click js-hero"
  id="cta_hero_get_started"
>
  Get Started
</button>
```

### Secondary Hero CTA

**Before**:
```jsx
<button class="btn-secondary">Watch Demo</button>
```

**After**:
```jsx
<button
  className="btn-secondary js-track js-demo js-click js-hero"
  id="cta_hero_watch_demo"
>
  Watch Demo
</button>
```

### Footer CTA

**Before**:
```jsx
<button onClick={handleSignup}>Sign Up Now</button>
```

**After**:
```jsx
<button
  onClick={handleSignup}
  className="js-track js-cta js-click js-footer"
  id="cta_footer_signup"
>
  Sign Up Now
</button>
```

### Tailwind-Styled CTA

**Before**:
```jsx
<button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
  Start Free Trial
</button>
```

**After**:
```jsx
<button
  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 js-track js-cta js-click js-hero"
  id="cta_hero_start_trial"
>
  Start Free Trial
</button>
```

## Navigation Links

### Header Navigation (Next.js Link)

**Before**:
```jsx
<Link href="/pricing">Pricing</Link>
```

**After**:
```jsx
<Link
  href="/pricing"
  className="js-track js-nav js-click js-header"
  id="nav_header_pricing"
>
  Pricing
</Link>
```

### Navbar with Existing Classes

**Before**:
```jsx
<Link href="/about" className="nav-link text-gray-700">About</Link>
```

**After**:
```jsx
<Link
  href="/about"
  className="nav-link text-gray-700 js-track js-nav js-click js-header"
  id="nav_header_about"
>
  About
</Link>
```

### Footer Link

**Before**:
```jsx
<a href="/privacy">Privacy Policy</a>
```

**After**:
```jsx
<a
  href="/privacy"
  className="js-track js-nav js-click js-footer"
  id="nav_footer_privacy"
>
  Privacy Policy
</a>
```

### External Link (Outbound)

**Before**:
```jsx
<a href="https://twitter.com/company" target="_blank">
  <TwitterIcon />
</a>
```

**After**:
```jsx
<a
  href="https://twitter.com/company"
  target="_blank"
  className="js-track js-outbound js-click js-footer"
  id="outbound_footer_twitter"
>
  <TwitterIcon />
</a>
```

## Forms

### Newsletter Form

**Before**:
```jsx
<form onSubmit={handleSubmit}>
  <input type="email" placeholder="Your email" />
  <button type="submit">Subscribe</button>
</form>
```

**After**:
```jsx
<form
  onSubmit={handleSubmit}
  className="js-track js-form js-submit js-footer"
  id="form_footer_newsletter"
>
  <input type="email" placeholder="Your email" />
  <button type="submit">Subscribe</button>
</form>
```

### Contact Form

**Before**:
```jsx
<form className="contact-form" onSubmit={handleContact}>
  <input type="text" name="name" />
  <input type="email" name="email" />
  <textarea name="message"></textarea>
  <button type="submit">Send Message</button>
</form>
```

**After**:
```jsx
<form
  className="contact-form js-track js-form js-submit js-hero"
  id="form_hero_contact"
  onSubmit={handleContact}
>
  <input type="text" name="name" />
  <input type="email" name="email" />
  <textarea name="message"></textarea>
  <button type="submit">Send Message</button>
</form>
```

### Search Form

**Before**:
```jsx
<form className="search-form" onSubmit={handleSearch}>
  <input type="search" placeholder="Search..." />
  <button type="submit">
    <SearchIcon />
  </button>
</form>
```

**After**:
```jsx
<form
  className="search-form js-track js-form js-submit js-header"
  id="form_header_search"
  onSubmit={handleSearch}
>
  <input type="search" placeholder="Search..." />
  <button type="submit">
    <SearchIcon />
  </button>
</form>
```

## Pricing Elements

### Pricing Plan CTA

**Before**:
```jsx
<button className="pricing-btn">Choose Pro Plan</button>
```

**After**:
```jsx
<button
  className="pricing-btn js-track js-pricing js-click js-pricing"
  id="cta_pricing_choose_pro"
>
  Choose Pro Plan
</button>
```

### Pricing Tier Selection

**Before**:
```jsx
<div className="plan-card">
  <h3>Enterprise</h3>
  <button>Contact Sales</button>
</div>
```

**After**:
```jsx
<div className="plan-card">
  <h3>Enterprise</h3>
  <button
    className="js-track js-pricing js-click js-pricing"
    id="cta_pricing_contact_sales"
  >
    Contact Sales
  </button>
</div>
```

## Authentication

### Login Button

**Before**:
```jsx
<button onClick={handleLogin}>Login</button>
```

**After**:
```jsx
<button
  onClick={handleLogin}
  className="js-track js-auth js-click js-header"
  id="cta_header_login"
>
  Login
</button>
```

### Signup Link

**Before**:
```jsx
<Link href="/signup">Sign Up</Link>
```

**After**:
```jsx
<Link
  href="/signup"
  className="js-track js-auth js-click js-header"
  id="cta_header_signup"
>
  Sign Up
</Link>
```

### Logout Button

**Before**:
```jsx
<button onClick={handleLogout}>Logout</button>
```

**After**:
```jsx
<button
  onClick={handleLogout}
  className="js-track js-auth js-click js-header"
  id="cta_header_logout"
>
  Logout
</button>
```

## Media Elements

### Hero Video

**Before**:
```jsx
<video src="/demo.mp4" controls>
  <source src="/demo.mp4" type="video/mp4" />
</video>
```

**After**:
```jsx
<video
  src="/demo.mp4"
  controls
  className="js-track js-media js-play js-hero"
  id="video_hero_product_demo"
>
  <source src="/demo.mp4" type="video/mp4" />
</video>
```

### YouTube Embed

**Before**:
```jsx
<iframe
  src="https://www.youtube.com/embed/VIDEO_ID"
  frameBorder="0"
  allowFullScreen
></iframe>
```

**After**:
```jsx
<iframe
  src="https://www.youtube.com/embed/VIDEO_ID"
  frameBorder="0"
  allowFullScreen
  className="js-track js-media js-play js-hero"
  id="video_hero_demo_youtube"
></iframe>
```

### Audio Player

**Before**:
```jsx
<audio src="/podcast.mp3" controls></audio>
```

**After**:
```jsx
<audio
  src="/podcast.mp3"
  controls
  className="js-track js-media js-play js-content"
  id="audio_content_podcast"
></audio>
```

## Demo Requests

### Demo CTA Button

**Before**:
```jsx
<button className="demo-btn">Book a Demo</button>
```

**After**:
```jsx
<button
  className="demo-btn js-track js-demo js-click js-hero"
  id="cta_hero_book_demo"
>
  Book a Demo
</button>
```

### Watch Demo Link

**Before**:
```jsx
<a href="/demo">Watch Demo Video</a>
```

**After**:
```jsx
<a
  href="/demo"
  className="js-track js-demo js-click js-features"
  id="cta_features_watch_demo"
>
  Watch Demo Video
</a>
```

## Ambiguous Cases

### "Learn More" as Primary CTA

**Before**:
```jsx
<button className="hero-cta">Learn More</button>
```

**After** (if primary action):
```jsx
<button
  className="hero-cta js-track js-cta js-click js-hero"
  id="cta_hero_learn_more"
>
  Learn More
</button>
```

### "Learn More" as Navigation

**Before**:
```jsx
<a href="/features">Learn More →</a>
```

**After** (if secondary navigation):
```jsx
<a
  href="/features"
  className="js-track js-nav js-click js-features"
  id="nav_features_learn_more"
>
  Learn More →
</a>
```

### "Contact Us" in Navbar

**Before**:
```jsx
<Link href="/contact">Contact Us</Link>
```

**After** (navigation context):
```jsx
<Link
  href="/contact"
  className="js-track js-nav js-click js-header"
  id="nav_header_contact"
>
  Contact Us
</Link>
```

### "Contact Us" as Hero CTA

**Before**:
```jsx
<button className="primary-btn">Contact Us</button>
```

**After** (CTA context):
```jsx
<button
  className="primary-btn js-track js-cta js-click js-hero"
  id="cta_hero_contact"
>
  Contact Us
</button>
```

## Framework-Specific Patterns

### Next.js App Router (Client Component)

**Before**:
```tsx
'use client'

export default function HeroCTA() {
  return (
    <button onClick={() => router.push('/signup')}>
      Get Started
    </button>
  )
}
```

**After**:
```tsx
'use client'

export default function HeroCTA() {
  return (
    <button
      onClick={() => router.push('/signup')}
      className="js-track js-cta js-click js-hero"
      id="cta_hero_get_started"
    >
      Get Started
    </button>
  )
}
```

### Vue Composition API

**Before**:
```vue
<template>
  <button @click="handleClick">Click Me</button>
</template>
```

**After**:
```vue
<template>
  <button
    @click="handleClick"
    :class="['js-track', 'js-cta', 'js-click', 'js-hero']"
    id="cta_hero_click_me"
  >
    Click Me
  </button>
</template>
```

### React with Styled Components

**Before**:
```jsx
<StyledButton onClick={handleClick}>
  Get Started
</StyledButton>
```

**After**:
```jsx
<StyledButton
  onClick={handleClick}
  className="js-track js-cta js-click js-hero"
  id="cta_hero_get_started"
>
  Get Started
</StyledButton>
```

## Complex Components

### Modal with Multiple CTAs

**Before**:
```jsx
<div className="modal">
  <h2>Confirm Action</h2>
  <button onClick={handleConfirm}>Confirm</button>
  <button onClick={handleCancel}>Cancel</button>
</div>
```

**After**:
```jsx
<div className="modal">
  <h2>Confirm Action</h2>
  <button
    onClick={handleConfirm}
    className="js-track js-cta js-click js-modal"
    id="cta_modal_confirm"
  >
    Confirm
  </button>
  <button
    onClick={handleCancel}
    className="js-track js-cta js-click js-modal"
    id="cta_modal_cancel"
  >
    Cancel
  </button>
</div>
```

### Card with Multiple Actions

**Before**:
```jsx
<div className="feature-card">
  <h3>Feature Name</h3>
  <p>Description...</p>
  <button>Learn More</button>
  <button>Try Now</button>
</div>
```

**After**:
```jsx
<div className="feature-card">
  <h3>Feature Name</h3>
  <p>Description...</p>
  <button
    className="js-track js-nav js-click js-features"
    id="nav_features_learn_more"
  >
    Learn More
  </button>
  <button
    className="js-track js-cta js-click js-features"
    id="cta_features_try_now"
  >
    Try Now
  </button>
</div>
```

### Navbar with Dropdown

**Before**:
```jsx
<nav>
  <Link href="/">Home</Link>
  <Link href="/products">Products</Link>
  <div className="dropdown">
    <button>Resources</button>
    <div className="dropdown-menu">
      <Link href="/docs">Documentation</Link>
      <Link href="/blog">Blog</Link>
    </div>
  </div>
</nav>
```

**After**:
```jsx
<nav>
  <Link
    href="/"
    className="js-track js-nav js-click js-header"
    id="nav_header_home"
  >
    Home
  </Link>
  <Link
    href="/products"
    className="js-track js-nav js-click js-header"
    id="nav_header_products"
  >
    Products
  </Link>
  <div className="dropdown">
    <button
      className="js-track js-nav js-click js-header"
      id="nav_header_resources_toggle"
    >
      Resources
    </button>
    <div className="dropdown-menu">
      <Link
        href="/docs"
        className="js-track js-nav js-click js-header"
        id="nav_header_docs"
      >
        Documentation
      </Link>
      <Link
        href="/blog"
        className="js-track js-nav js-click js-header"
        id="nav_header_blog"
      >
        Blog
      </Link>
    </div>
  </div>
</nav>
```

## Edge Cases

### Button with Icon Only

**Before**:
```jsx
<button>
  <MenuIcon />
</button>
```

**After**:
```jsx
<button
  aria-label="Open menu"
  className="js-track js-nav js-click js-header"
  id="nav_header_menu_toggle"
>
  <MenuIcon />
</button>
```

### Div with onClick (Non-Semantic)

**Before**:
```jsx
<div onClick={handleClick}>Click me</div>
```

**After** (with accessibility fix):
```jsx
<div
  onClick={handleClick}
  role="button"
  tabIndex={0}
  onKeyPress={(e) => e.key === 'Enter' && handleClick()}
  className="js-track js-cta js-click js-hero"
  id="cta_hero_custom"
>
  Click me
</div>
```

**Better** (use semantic HTML):
```jsx
<button
  onClick={handleClick}
  className="js-track js-cta js-click js-hero"
  id="cta_hero_custom"
>
  Click me
</button>
```

### Download Link

**Before**:
```jsx
<a href="/whitepaper.pdf" download>Download Whitepaper</a>
```

**After**:
```jsx
<a
  href="/whitepaper.pdf"
  download
  className="js-track js-download js-click js-content"
  id="download_content_whitepaper"
>
  Download Whitepaper
</a>
```

## Quick Reference

| Element Type | ID Pattern | Class Pattern |
|--------------|-----------|---------------|
| Primary CTA | `cta_{location}_{action}` | `js-track js-cta js-click js-{location}` |
| Navigation | `nav_{location}_{page}` | `js-track js-nav js-click js-{location}` |
| Form | `form_{location}_{type}` | `js-track js-form js-submit js-{location}` |
| Pricing CTA | `cta_pricing_{action}` | `js-track js-pricing js-click js-pricing` |
| Auth | `cta_{location}_{action}` | `js-track js-auth js-click js-{location}` |
| Demo | `cta_{location}_demo` | `js-track js-demo js-click js-{location}` |
| Outbound | `outbound_{location}_{site}` | `js-track js-outbound js-click js-{location}` |
| Media | `video_{location}_{name}` | `js-track js-media js-play js-{location}` |
