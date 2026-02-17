# GTM Implementation Template

This template shows the code patterns Claude uses when implementing dataLayer events. Reference when customising implementation for your framework.

---

## DataLayer Push Pattern

### Basic pattern (all frameworks)

```javascript
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: 'event_name',
  param_one: 'value',
  param_two: 'value',
});
```

---

## Framework-Specific Patterns

### Next.js App Router (requires 'use client')

```tsx
'use client';

// In component file
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
  }}
>
  Get Started
</button>
```

### React (Pages Router / standard)

```tsx
import { useCallback } from 'react';

function HeroButton() {
  const handleClick = useCallback(() => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'cta_click',
      cta_location: 'hero',
      cta_type: 'primary',
      cta_text: 'Get Started',
      cta_destination: '/signup',
    });
  }, []);

  return (
    <button
      id="cta_hero_get_started"
      className="btn primary js-track js-cta js-click js-hero"
      onClick={handleClick}
    >
      Get Started
    </button>
  );
}
```

### Vue 3 (Composition API)

```vue
<template>
  <button
    id="cta_hero_get_started"
    class="btn primary js-track js-cta js-click js-hero"
    @click="handleClick"
  >
    Get Started
  </button>
</template>

<script setup>
function handleClick() {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'cta_click',
    cta_location: 'hero',
    cta_type: 'primary',
    cta_text: 'Get Started',
    cta_destination: '/signup',
  });
}
</script>
```

---

## Form Tracking Pattern

```tsx
// Track form_start on first input interaction
<form
  id="form_contact_main"
  onFocus={() => {
    if (!formStarted) {
      window.dataLayer.push({ event: 'form_start', form_name: 'contact_main', form_location: 'hero' });
      setFormStarted(true);
    }
  }}
  onSubmit={(e) => {
    e.preventDefault();
    window.dataLayer.push({ event: 'form_submit', form_name: 'contact_main', form_location: 'hero', form_type: 'contact_request' });
    // handle submit...
  }}
>
```

---

## GTM Container Configuration

### Data Layer Variable

```javascript
// GTM API payload
{
  name: 'DL - CTA Location',
  type: 'dlauto',  // Data Layer Variable
  parameter: [
    { type: 'integer', key: 'dataLayerVersion', value: '2' },
    { type: 'template', key: 'name', value: 'cta_location' },
  ]
}
```

### Custom Event Trigger

```javascript
{
  name: 'CE - CTA Click',
  type: 'customEvent',
  customEventFilter: [
    { type: 'equals', parameter: [
      { type: 'template', key: 'arg0', value: '{{_event}}' },
      { type: 'template', key: 'arg1', value: 'cta_click' },
    ]}
  ]
}
```

### GA4 Event Tag

```javascript
{
  name: 'GA4 - CTA Click',
  type: 'gaawe',
  parameter: [
    { type: 'boolean', key: 'sendEcommerceData', value: 'false' },
    { type: 'template', key: 'eventName', value: 'cta_click' },
    { type: 'template', key: 'measurementIdOverride', value: 'G-XXXXXXXXXX' },
    {
      type: 'list',
      key: 'eventSettingsTable',
      list: [
        { type: 'map', map: [
          { type: 'template', key: 'parameter', value: 'cta_location' },
          { type: 'template', key: 'parameterValue', value: '{{DL - CTA Location}}' },
        ]},
        { type: 'map', map: [
          { type: 'template', key: 'parameter', value: 'cta_text' },
          { type: 'template', key: 'parameterValue', value: '{{DL - CTA Text}}' },
        ]},
      ]
    }
  ],
  firingTriggerId: ['<trigger-id>']
}
```
