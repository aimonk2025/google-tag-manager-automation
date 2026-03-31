# Event Naming Taxonomies

Guide to consistent event naming conventions for GTM/GA4 tracking.

## Naming Pattern Options

### Option 1: object_action (Recommended for GA4)

**Pattern**: `{object}_{action}`

**Examples**:
- `cta_click`
- `form_submit`
- `video_play`
- `navigation_click`
- `product_view`

**Pros**:
- Aligns with GA4 conventions
- Clear hierarchy (object first)
- Easy to filter by object type
- Groups related events naturally

**Cons**:
- Slightly longer names

**Use when**: Building for GA4 or starting new implementations

### Option 2: action_object

**Pattern**: `{action}_{object}`

**Examples**:
- `click_cta`
- `submit_form`
- `play_video`
- `click_navigation`
- `view_product`

**Pros**:
- Action-first mindset
- Reads like natural language ("click CTA")

**Cons**:
- Less common in GA4
- Harder to filter by object

**Use when**: Existing implementation uses this pattern

## Recommended Events by Category

### User Actions

| Event Name | Trigger | Parameters |
|------------|---------|-----------|
| `cta_click` | CTA button clicked | cta_location, cta_type, cta_text, cta_destination |
| `navigation_click` | Navigation link clicked | nav_location, nav_type, nav_text, nav_destination |
| `download` | File download link clicked | file_name, file_type, download_location |
| `outbound_click` | External link clicked | outbound_destination, outbound_location, outbound_text |
| `search` | Search performed | search_query, search_location, search_results_count |

### Forms

| Event Name | Trigger | Parameters |
|------------|---------|-----------|
| `form_start` | User interacts with first form field | form_name, form_location |
| `form_submit` | Form submitted | form_name, form_location, form_type |
| `form_error` | Form validation error | form_name, error_field, error_message |
| `form_abandon` | User leaves form without submitting | form_name, form_location, time_spent |

### Content Engagement

| Event Name | Trigger | Parameters |
|------------|---------|-----------|
| `page_view` | Page viewed | page_path, page_title, page_category |
| `scroll` | User scrolls to depth | scroll_depth (25, 50, 75, 90) |
| `content_view` | Content section viewed | content_type, content_title, content_id |
| `tab_click` | Tab switched | tab_name, tab_location |
| `accordion_expand` | Accordion opened | accordion_title, accordion_location |

### Media

| Event Name | Trigger | Parameters |
|------------|---------|-----------|
| `video_play` | Video starts | video_title, video_location, video_duration |
| `video_progress` | Video milestone reached | video_title, video_percent (25/50/75/100) |
| `video_complete` | Video finished | video_title, video_location |
| `video_pause` | Video paused | video_title, video_current_time |

### E-commerce

| Event Name | Trigger | Parameters |
|------------|---------|-----------|
| `product_view` | Product page viewed | product_id, product_name, product_category, product_price |
| `add_to_cart` | Item added to cart | product_id, product_name, quantity, value |
| `remove_from_cart` | Item removed | product_id, product_name |
| `checkout_start` | Checkout initiated | cart_value, item_count |
| `checkout_step` | Checkout step completed | step_number, step_name |
| `purchase` | Purchase completed | transaction_id, value, items |

### SaaS/Product

| Event Name | Trigger | Parameters |
|------------|---------|-----------|
| `trial_start` | Free trial started | plan_name, trial_duration |
| `account_created` | User signs up | account_type, signup_method |
| `feature_usage` | Feature used | feature_name, usage_type |
| `upgrade_click` | Upgrade CTA clicked | current_plan, target_plan, upgrade_location |
| `plan_selected` | Pricing plan chosen | plan_name, plan_price, billing_frequency |

### Lead Generation

| Event Name | Trigger | Parameters |
|------------|---------|-----------|
| `demo_request` | Demo requested | demo_type, request_source |
| `contact_request` | Contact form submitted | request_type, request_source |
| `content_download` | Gated content downloaded | content_type, content_title |
| `newsletter_signup` | Newsletter subscription | signup_location, list_name |
| `resource_access` | Resource accessed | resource_type, resource_title |

## Parameter Naming Conventions

### General Rules

1. **Lowercase with underscores**: `cta_location` not `ctaLocation` or `cta-location`
2. **Descriptive but concise**: `nav_destination` not `navigation_link_destination`
3. **Prefixed by object**: `cta_text`, `form_name`, `video_title`
4. **Consistent value formats**: Use same values across events

### Common Parameter Patterns

**Location Parameters**:
```
{object}_location: "hero" | "header" | "footer" | "sidebar" | "modal" | "pricing"
```

**Type Parameters**:
```
{object}_type: "primary" | "secondary" | "text" | "icon"
form_type: "contact" | "newsletter" | "demo_request" | "email_capture"
```

**Identification Parameters**:
```
{object}_id: Unique identifier
{object}_name: Human-readable name
{object}_title: Display title
```

**Action Parameters**:
```
{object}_text: Button/link text content
{object}_destination: URL or action target
```

**Measurement Parameters**:
```
{object}_value: Numeric value (price, duration, etc.)
{object}_percent: Percentage (0-100)
{object}_count: Count/quantity
```

## Value Standards

### Consistent Value Formats

**Locations** (lowercase, underscores):
```typescript
cta_location: "hero" | "header" | "footer" | "pricing_section" | "features_section"
```

**Types** (lowercase, underscores):
```typescript
cta_type: "primary" | "secondary" | "text_link" | "icon_button"
```

**Booleans** (true/false, not "yes"/"no"):
```typescript
is_logged_in: true | false
```

**Numbers** (actual numbers, not strings):
```typescript
product_price: 29.99  // Not "29.99" or "$29.99"
scroll_depth: 50      // Not "50%" or "50"
```

## Event Hierarchy

Group related events with shared prefixes:

### Form Events
```
form_start
form_submit
form_error
form_abandon
```

### Video Events
```
video_play
video_progress
video_pause
video_complete
```

### Product Events
```
product_view
product_compare
product_add_to_wishlist
product_share
```

This grouping:
- Makes filtering easier in GA4
- Creates logical event families
- Improves report organization

## GA4-Specific Patterns

### Reserved Event Names (Don't Use)

GA4 reserves these event names - don't use them for custom events:

```
ad_click
ad_exposure
ad_impression
ad_query
add_payment_info
add_shipping_info
add_to_cart
add_to_wishlist
app_clear_data
app_exception
app_remove
app_store_refund
app_store_subscription_cancel
app_store_subscription_convert
app_store_subscription_renew
app_update
begin_checkout
campaign_details
earn_virtual_currency
file_download
first_open
first_visit
generate_lead
in_app_purchase
join_group
level_end
level_start
level_up
login
page_view
post_score
purchase
refund
remove_from_cart
screen_view
search
select_content
select_item
select_promotion
session_start
share
sign_up
spend_virtual_currency
tutorial_begin
tutorial_complete
unlock_achievement
user_engagement
view_cart
view_item
view_item_list
view_promotion
view_search_results
```

**Solution**: Use custom prefixes for similar events:
- `custom_page_view` instead of `page_view`
- `app_download` instead of `file_download`
- `product_search` instead of `search`

### Automatically Collected Events

GA4 automatically tracks these (no implementation needed):

```
page_view (web)
first_visit (web)
session_start
user_engagement
scroll (optional, can enable)
outbound_click (optional, can enable)
file_download (optional, can enable)
video_* (optional, can enable)
```

## Examples by Business Model

### SaaS Application

```typescript
// Trial & Conversion
trial_start
account_created
plan_selected
upgrade_click
payment_completed

// Product Usage
feature_usage
dashboard_view
report_generated
export_data
integration_connected

// Engagement
help_clicked
tutorial_started
tutorial_completed
feedback_submitted
```

### E-commerce Site

```typescript
// Discovery
product_search
product_view
product_compare
filter_applied
sort_changed

// Cart
add_to_cart
remove_from_cart
cart_view
apply_coupon

// Checkout
checkout_start
shipping_info_added
payment_info_added
purchase

// Post-Purchase
review_submitted
product_shared
reorder_clicked
```

### Lead Generation Site

```typescript
// Top of Funnel
content_view
resource_download
webinar_registration
newsletter_signup

// Middle of Funnel
demo_request
contact_form_submit
pricing_view
comparison_tool_used

// Bottom of Funnel
consultation_booked
quote_requested
trial_started
```

## Best Practices

### 1. Consistency is Key

Use the same naming pattern across your entire implementation:

```typescript
// ✅ Good (consistent object_action)
cta_click
form_submit
video_play

// ❌ Bad (mixed patterns)
cta_click
submit_form  // Inconsistent!
playVideo    // Inconsistent!
```

### 2. Limit Event Count

**Guideline**: 50-100 unique events maximum

**Why**: Too many events = analysis paralysis

**Strategy**: Use parameters for variations instead of new events

```typescript
// ✅ Good (one event, parameter for variation)
{ event: 'cta_click', cta_type: 'signup' }
{ event: 'cta_click', cta_type: 'demo' }

// ❌ Bad (separate events)
{ event: 'signup_cta_click' }
{ event: 'demo_cta_click' }
```

### 3. Make Events Actionable

Every event should answer: "What decision does this inform?"

```typescript
// ✅ Good (actionable - shows which CTAs convert)
{ event: 'cta_click', cta_location: 'pricing', cta_text: 'Start Trial' }

// ❌ Bad (not actionable - too generic)
{ event: 'click' }
```

### 4. Design for Reporting

Think about how events will be filtered/segmented in reports:

```typescript
// ✅ Good (easy to filter by location, type, text)
{
  event: 'cta_click',
  cta_location: 'hero',
  cta_type: 'primary',
  cta_text: 'Get Started'
}

// ❌ Bad (hard to filter)
{
  event: 'button_hero_primary_get_started_clicked'
}
```

### 5. Plan for Evolution

Use extensible parameter patterns:

```typescript
// ✅ Good (can add more video parameters later)
{
  event: 'video_play',
  video_title: 'demo',
  video_location: 'hero'
  // Easy to add: video_duration, video_category, video_author
}

// ❌ Bad (locked into specific structure)
{
  event: 'play_demo_video_hero'
}
```

## Quick Reference

**Event Names**: `object_action` (lowercase, underscore)

**Parameters**: `{object}_{attribute}` (lowercase, underscore)

**Values**: Lowercase, underscores for multi-word ("primary_button")

**Numbers**: Actual numbers, not strings (50 not "50")

**Booleans**: true/false, not "yes"/"no"

**Limit**: 50-100 unique events maximum

**Priority**: P0 events drive 80% of value - focus there first
