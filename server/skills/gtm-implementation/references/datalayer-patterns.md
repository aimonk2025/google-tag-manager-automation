# DataLayer Implementation Patterns

Framework-specific patterns for implementing dataLayer.push() events across different JavaScript frameworks.

## Core Pattern (Framework-Agnostic)

All dataLayer implementations follow this core pattern:

```javascript
if (typeof window !== 'undefined' && window.dataLayer) {
  window.dataLayer.push({
    event: 'event_name',
    parameter1: 'value1',
    parameter2: 'value2'
  })
}
```

**Key principles**:
- Check `typeof window !== 'undefined'` for SSR safety
- Check `window.dataLayer` exists before pushing
- Use structured event objects with clear parameter names

## Next.js App Router

### Button with Click Tracking

**Before**:
```tsx
<button className="btn-primary">
  Get Started
</button>
```

**After** (Client Component Required):
```tsx
'use client'

export default function CTAButton() {
  return (
    <button
      className="btn-primary js-track js-cta js-click js-hero"
      id="cta_hero_get_started"
      onClick={() => {
        if (typeof window !== 'undefined' && window.dataLayer) {
          window.dataLayer.push({
            event: 'cta_click',
            cta_location: 'hero',
            cta_type: 'primary',
            cta_text: 'Get Started',
            cta_destination: '/signup'
          })
        }
      }}
    >
      Get Started
    </button>
  )
}
```

### Link with Navigation

**Before**:
```tsx
import Link from 'next/link'

<Link href="/pricing">Pricing</Link>
```

**After**:
```tsx
'use client'

import Link from 'next/link'

<Link
  href="/pricing"
  className="js-track js-nav js-click js-header"
  id="nav_header_pricing"
  onClick={() => {
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'navigation_click',
        nav_location: 'header',
        nav_type: 'menu_link',
        nav_text: 'Pricing',
        nav_destination: '/pricing'
      })
    }
  }}
>
  Pricing
</Link>
```

### Form with Submit Tracking

**Before**:
```tsx
'use client'

export default function ContactForm() {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Submit logic
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" />
      <button type="submit">Submit</button>
    </form>
  )
}
```

**After**:
```tsx
'use client'

export default function ContactForm() {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Track form submission
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'form_submit',
        form_name: 'contact',
        form_location: 'hero',
        form_type: 'contact_request'
      })
    }

    // Original submit logic
    // ...
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="js-track js-form js-submit js-hero"
      id="form_hero_contact"
    >
      <input type="email" />
      <button type="submit">Submit</button>
    </form>
  )
}
```

### Button with Router Navigation

**Before**:
```tsx
'use client'

import { useRouter } from 'next/navigation'

export default function SignupButton() {
  const router = useRouter()

  return (
    <button onClick={() => router.push('/signup')}>
      Sign Up
    </button>
  )
}
```

**After**:
```tsx
'use client'

import { useRouter } from 'next/navigation'

export default function SignupButton() {
  const router = useRouter()

  const handleClick = () => {
    // Track click
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'cta_click',
        cta_location: 'header',
        cta_type: 'primary',
        cta_text: 'Sign Up',
        cta_destination: '/signup'
      })
    }

    // Navigate
    router.push('/signup')
  }

  return (
    <button
      onClick={handleClick}
      className="js-track js-cta js-click js-header"
      id="cta_header_signup"
    >
      Sign Up
    </button>
  )
}
```

## Next.js Pages Router

### Button in Page Component

```tsx
import { useRouter } from 'next/router'

export default function HomePage() {
  const router = useRouter()

  const handleCTAClick = () => {
    // Track
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'cta_click',
        cta_location: 'hero',
        cta_type: 'primary',
        cta_text: 'Get Started',
        cta_destination: '/signup'
      })
    }

    // Navigate
    router.push('/signup')
  }

  return (
    <button
      onClick={handleCTAClick}
      className="js-track js-cta js-click js-hero"
      id="cta_hero_get_started"
    >
      Get Started
    </button>
  )
}
```

## React (Create React App / Vite)

### Functional Component with Hooks

```tsx
import { useState } from 'react'

export default function NewsletterForm() {
  const [email, setEmail] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Track submission
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'form_submit',
        form_name: 'newsletter',
        form_location: 'footer',
        form_type: 'email_capture'
      })
    }

    // Submit logic
    console.log('Submitting:', email)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="js-track js-form js-submit js-footer"
      id="form_footer_newsletter"
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
      />
      <button type="submit">Subscribe</button>
    </form>
  )
}
```

### Class Component (Legacy Pattern)

```tsx
import React, { Component } from 'react'

class CTAButton extends Component {
  handleClick = () => {
    // Track click
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'cta_click',
        cta_location: 'hero',
        cta_type: 'primary',
        cta_text: 'Get Started',
        cta_destination: '/signup'
      })
    }

    // Navigation logic
    window.location.href = '/signup'
  }

  render() {
    return (
      <button
        onClick={this.handleClick}
        className="js-track js-cta js-click js-hero"
        id="cta_hero_get_started"
      >
        Get Started
      </button>
    )
  }
}

export default CTAButton
```

## Vue 3 (Composition API)

### Button with Click Tracking

```vue
<template>
  <button
    :class="['btn-primary', 'js-track', 'js-cta', 'js-click', 'js-hero']"
    id="cta_hero_get_started"
    @click="handleClick"
  >
    Get Started
  </button>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const handleClick = () => {
  // Track click
  if (typeof window !== 'undefined' && window.dataLayer) {
    window.dataLayer.push({
      event: 'cta_click',
      cta_location: 'hero',
      cta_type: 'primary',
      cta_text: 'Get Started',
      cta_destination: '/signup'
    })
  }

  // Navigate
  router.push('/signup')
}
</script>
```

### Form with Submit Tracking

```vue
<template>
  <form
    :class="['contact-form', 'js-track', 'js-form', 'js-submit', 'js-hero']"
    id="form_hero_contact"
    @submit.prevent="handleSubmit"
  >
    <input v-model="email" type="email" placeholder="Your email" />
    <button type="submit">Submit</button>
  </form>
</template>

<script setup>
import { ref } from 'vue'

const email = ref('')

const handleSubmit = () => {
  // Track submission
  if (typeof window !== 'undefined' && window.dataLayer) {
    window.dataLayer.push({
      event: 'form_submit',
      form_name: 'contact',
      form_location: 'hero',
      form_type: 'contact_request'
    })
  }

  // Submit logic
  console.log('Submitting:', email.value)
}
</script>
```

## Vue 2 (Options API)

### Button Component

```vue
<template>
  <button
    :class="['btn-primary', 'js-track', 'js-cta', 'js-click', 'js-hero']"
    id="cta_hero_get_started"
    @click="handleClick"
  >
    Get Started
  </button>
</template>

<script>
export default {
  methods: {
    handleClick() {
      // Track click
      if (typeof window !== 'undefined' && window.dataLayer) {
        window.dataLayer.push({
          event: 'cta_click',
          cta_location: 'hero',
          cta_type: 'primary',
          cta_text: 'Get Started',
          cta_destination: '/signup'
        })
      }

      // Navigate
      this.$router.push('/signup')
    }
  }
}
</script>
```

## Vanilla JavaScript

### Button with Event Listener

```javascript
// Find all buttons with tracking classes
document.querySelectorAll('.js-track.js-cta').forEach(button => {
  button.addEventListener('click', function() {
    // Extract parameters from DOM
    const id = this.id // "cta_hero_get_started"
    const [category, location, ...action] = id.split('_')
    const text = this.innerText
    const destination = this.getAttribute('data-destination') || '#'

    // Track click
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'cta_click',
        cta_location: location,
        cta_type: this.classList.contains('primary') ? 'primary' : 'secondary',
        cta_text: text,
        cta_destination: destination
      })
    }
  })
})
```

### Form Submit Handler

```javascript
document.querySelectorAll('.js-track.js-form').forEach(form => {
  form.addEventListener('submit', function(e) {
    // Extract parameters
    const id = this.id // "form_footer_newsletter"
    const [category, location, ...name] = id.split('_')

    // Track submission
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'form_submit',
        form_name: name.join('_'),
        form_location: location,
        form_type: this.getAttribute('data-form-type') || 'unknown'
      })
    }
  })
})
```

## Advanced Patterns

### Form Start Tracking

Track when users begin filling out a form (not just submission):

```tsx
'use client'

import { useState } from 'react'

export default function ContactForm() {
  const [hasStarted, setHasStarted] = useState(false)

  const handleFormStart = () => {
    if (!hasStarted) {
      setHasStarted(true)

      // Track form start
      if (typeof window !== 'undefined' && window.dataLayer) {
        window.dataLayer.push({
          event: 'form_start',
          form_name: 'contact',
          form_location: 'hero'
        })
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Track form submit
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'form_submit',
        form_name: 'contact',
        form_location: 'hero',
        form_type: 'contact_request'
      })
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        onFocus={handleFormStart}
        placeholder="Name"
      />
      <input
        type="email"
        onFocus={handleFormStart}
        placeholder="Email"
      />
      <button type="submit">Submit</button>
    </form>
  )
}
```

### Video Play Tracking

```tsx
'use client'

export default function ProductVideo() {
  const handlePlay = () => {
    if (typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'video_play',
        video_title: 'product_demo',
        video_location: 'hero',
        video_duration: 120 // seconds
      })
    }
  }

  return (
    <video
      controls
      onPlay={handlePlay}
      className="js-track js-media js-play js-hero"
      id="video_hero_product_demo"
    >
      <source src="/demo.mp4" type="video/mp4" />
    </video>
  )
}
```

### Video Progress Tracking

```tsx
'use client'

import { useRef, useState } from 'react'

export default function TrackedVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [milestones, setMilestones] = useState({
    '25': false,
    '50': false,
    '75': false,
    '100': false
  })

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return

    const percent = (video.currentTime / video.duration) * 100

    // Track 25% milestone
    if (percent >= 25 && !milestones['25']) {
      setMilestones(prev => ({ ...prev, '25': true }))
      window.dataLayer?.push({
        event: 'video_progress',
        video_title: 'product_demo',
        video_percent: 25
      })
    }

    // Track 50% milestone
    if (percent >= 50 && !milestones['50']) {
      setMilestones(prev => ({ ...prev, '50': true }))
      window.dataLayer?.push({
        event: 'video_progress',
        video_title: 'product_demo',
        video_percent: 50
      })
    }

    // Track 75% milestone
    if (percent >= 75 && !milestones['75']) {
      setMilestones(prev => ({ ...prev, '75': true }))
      window.dataLayer?.push({
        event: 'video_progress',
        video_title: 'product_demo',
        video_percent: 75
      })
    }

    // Track 100% (complete)
    if (percent >= 95 && !milestones['100']) {
      setMilestones(prev => ({ ...prev, '100': true }))
      window.dataLayer?.push({
        event: 'video_complete',
        video_title: 'product_demo'
      })
    }
  }

  return (
    <video
      ref={videoRef}
      controls
      onTimeUpdate={handleTimeUpdate}
    >
      <source src="/demo.mp4" type="video/mp4" />
    </video>
  )
}
```

## Best Practices

### 1. SSR Safety

Always check for `window` before accessing dataLayer:

```typescript
// ✅ Good (SSR-safe)
if (typeof window !== 'undefined' && window.dataLayer) {
  window.dataLayer.push({...})
}

// ❌ Bad (breaks SSR)
window.dataLayer.push({...})
```

### 2. TypeScript Typing

Add proper types for window.dataLayer:

```typescript
// types/gtm.d.ts
interface DataLayerEvent {
  event: string
  [key: string]: string | number | boolean | undefined
}

declare global {
  interface Window {
    dataLayer: DataLayerEvent[]
  }
}

export {}
```

### 3. Event Naming Consistency

Use consistent event names across your application:

```typescript
// ✅ Good (consistent)
window.dataLayer.push({ event: 'cta_click', ... })
window.dataLayer.push({ event: 'form_submit', ... })

// ❌ Bad (inconsistent)
window.dataLayer.push({ event: 'ctaClick', ... })
window.dataLayer.push({ event: 'form-submit', ... })
```

### 4. Parameter Naming Consistency

Use prefixed parameter names:

```typescript
// ✅ Good (prefixed)
{
  event: 'cta_click',
  cta_location: 'hero',
  cta_type: 'primary'
}

// ❌ Bad (unprefixed, collision risk)
{
  event: 'cta_click',
  location: 'hero',  // Could collide with page location
  type: 'primary'    // Too generic
}
```

### 5. Preserve Existing Handlers

Never replace existing onClick handlers - add tracking before them:

```tsx
// ✅ Good (preserves original handler)
const handleClick = () => {
  // Track first
  window.dataLayer?.push({...})

  // Then run original logic
  originalHandler()
}

// ❌ Bad (loses original handler)
onClick={() => window.dataLayer.push({...})}
// Missing: originalHandler()
```
