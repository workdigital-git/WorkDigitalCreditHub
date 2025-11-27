# Membership & Credits Hub - Design Guidelines

## Design Approach: Financial Platform Design System

**Selected Approach**: Stripe-inspired design system with Material Design data components
**Rationale**: Financial platforms require trust, clarity, and efficient information processing. Stripe's minimalist aesthetic combined with Material's robust data components creates the ideal foundation for a membership and billing hub.

**Core Principles**:
- Trust through clarity: Clean layouts with ample whitespace
- Data-first: Optimized for scanning transactions, balances, and settings
- Professional restraint: Sophisticated without unnecessary decoration
- Responsive precision: Mobile-first for on-the-go balance checks

---

## Typography

**Font Stack**: Inter (via Google Fonts CDN)
- **Headings**: 600-700 weight, tight tracking (-0.02em)
- **Body**: 400 weight, normal line-height (1.5)
- **Data/Numbers**: 500 weight, tabular-nums for alignment
- **Labels**: 500 weight, uppercase, tracking (0.05em), text-xs

**Hierarchy**:
- Page titles: text-3xl font-semibold
- Section headers: text-xl font-semibold
- Card titles: text-lg font-medium
- Body text: text-base
- Labels/metadata: text-sm text-gray-600
- Financial amounts: text-2xl font-semibold tabular-nums

---

## Layout System

**Spacing Primitives**: Tailwind units of 3, 4, 6, 8, 12, 16
- Component padding: p-6
- Card spacing: p-8
- Section gaps: gap-6 or gap-8
- Page margins: px-6 md:px-8

**Container Strategy**:
- Max width: max-w-7xl mx-auto
- Dashboard grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- Sidebar layout: Fixed 256px sidebar, flexible main content area

**Navigation**:
- Top horizontal navbar: h-16, sticky top-0, backdrop-blur-lg
- Left sidebar (Dashboard view): w-64, fixed height with scrollable nav items
- Tab navigation: border-b-2 active state, hover underline effect

---

## Component Library

### Core UI Elements

**Cards**:
- Rounded corners: rounded-lg
- Subtle elevation: shadow-sm with hover:shadow-md transition
- Border treatment: border border-gray-200
- Padding: p-6 or p-8 for larger cards

**Buttons**:
- Primary: Solid with semibold text, px-6 py-2.5 rounded-md
- Secondary: Border outline style with hover fill
- Danger: Red accent for destructive actions
- Icon buttons: Square p-2 with rounded hover states
- Blur treatment on hero images: backdrop-blur-md bg-white/20

**Input Fields**:
- Border style: border border-gray-300 rounded-md
- Focus state: ring-2 ring-blue-500 ring-offset-1
- Padding: px-4 py-2.5
- Labels: Floating or top-aligned, text-sm font-medium mb-2

### Navigation Components

**Top Navbar**:
- Logo left, navigation center, user menu right
- Items: Dashboard | Wallet & Credits | My Apps | Billing Methods | Settings | Admin (conditional)
- Height: h-16
- Mobile: Hamburger menu with slide-in drawer

**Sidebar (Dashboard)**:
- Quick stats at top (Balance, Active Apps count)
- Main navigation items with icons
- Bottom section for user profile and logout

### Data Displays

**Transaction Tables**:
- Alternating row backgrounds: even:bg-gray-50
- Column headers: Sticky, font-medium, text-left
- Amount column: Right-aligned, tabular-nums, color-coded (green credits, red debits)
- Status badges: Rounded-full px-3 py-1, colored backgrounds

**Stat Cards** (Dashboard):
- Large number display: text-3xl tabular-nums
- Label below: text-sm uppercase tracking-wide
- Trend indicator: Small arrow icon + percentage change
- Layout: Grid of 3-4 cards at top of dashboard

**Transaction History**:
- List view with dividers between items
- Each item: Icon left, description + timestamp, amount right
- Expandable details on click

### Forms

**Payment Method Form**:
- Two-column layout on desktop: Card details left, billing address right
- Card input: Single field with auto-detection (Stripe style)
- Inline validation with real-time feedback
- Security badges: "Secure" icon, SSL indicators

**Auto-Topup Configuration**:
- Threshold slider with value display
- Amount input with currency symbol
- Toggle switch for enable/disable (large, iOS-style)
- Payment method dropdown with card preview

**2FA Setup Flow**:
- QR code display: Centered, large (256px), rounded border
- Backup codes: Monospace font, grid layout, copy buttons
- Step indicator: 1/3, 2/3, 3/3 progress dots

### Overlays

**Modals**:
- Max width: max-w-md to max-w-2xl based on content
- Backdrop: bg-black/50 backdrop-blur-sm
- Container: rounded-xl with shadow-2xl
- Close button: Top-right, gray circle with X icon

**Notifications/Toasts**:
- Fixed top-right position
- Auto-dismiss after 5 seconds
- Icon + message + close button
- Success: Green accent, Warning: Yellow, Error: Red

---

## Page-Specific Layouts

### Dashboard
- Grid layout: 3-column stat cards, 2-column main content
- Left column (2/3 width): Recent transactions table, Quick actions
- Right column (1/3 width): Wallet summary card, Active subscriptions list
- Mobile: Stack vertically

### Wallet & Credits
- Hero section: Large balance display with funding button
- Transaction filters: Date range, Type dropdown, Search input
- Transaction table: Scrollable with sticky header, pagination
- Quick action sidebar: Add funds, Set auto-topup, View methods

### Billing Methods
- Card grid: 2-3 columns showing saved payment methods
- Each card: Brand icon, last 4 digits, expiry, default badge, actions menu
- Add method button: Large, prominent, top-right
- Empty state: Illustration + "Add your first payment method" CTA

### Settings
- Tab navigation: Profile, Security (2FA), API Keys, Preferences
- Form sections with clear separation (dividers)
- Save changes: Sticky footer button on scroll

### Admin Panel
- Data table heavy: Users list, Apps registry, Platform stats
- Filters and search: Top toolbar with multiple inputs
- Bulk actions: Checkbox selection with action bar
- Detail views: Slide-out panels from right

---

## Images

**Dashboard Hero (if applicable)**: Not required - jump straight to functional content
**Marketing/Onboarding**: 
- Empty state illustrations: Abstract, minimal line art showing wallets, credit cards, secure locks
- 2FA setup: QR code placeholder (auto-generated)
- Payment brand logos: Visa, Mastercard, PayPal icons in payment method cards

**General Image Treatment**:
- Icons: Heroicons library (solid and outline variants)
- Avatars: Circular, 40px default, with fallback initials
- Brand logos: 24px-32px height, grayscale with colored hover state

---

## Animations

**Minimal Motion**:
- Button hover: Scale 1.02 with 150ms transition
- Card hover: Shadow elevation change (200ms ease)
- Modal entrance: Fade in + scale from 0.95 (250ms)
- Loading states: Subtle skeleton screens, no spinners unless processing

**Avoid**:
- Page transitions
- Scroll-triggered animations
- Parallax effects
- Auto-playing content

---

## Trust & Security Elements

- SSL badge in footer
- "Last login" timestamp in user menu
- Transaction confirmation modals with summary
- Masked sensitive data (show last 4 only)
- Security notice on sensitive actions ("This will charge your card")
- Two-step confirmation for destructive actions (delete methods, disable 2FA)