# Accessibility Testing Checklist

## Quick Reference for Developers

Use this checklist when adding new features or components to ensure accessibility compliance.

---

## ✅ Focus Indicators

**Requirement:** All interactive elements must have visible focus indicators

**How to implement:**
```css
/* Already configured in globals.css */
button:focus-visible,
[role="button"]:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
```

**Test:**
- Press Tab through all interactive elements
- Each should show visible outline or ring
- Focus should be clearly visible against all backgrounds

**Manual check:**
```bash
pnpm run test:e2e:accessibility -- -g "focus indicators"
```

---

## ✅ Keyboard Navigation

**Requirement:** All functionality accessible via keyboard

**Key interactions:**
- `Tab` / `Shift+Tab` - Navigate forward/backward
- `Enter` / `Space` - Activate buttons
- `Escape` - Close modals/dialogs
- Arrow keys - Navigate within components (tabs, menus)

**How to implement:**
```tsx
// Ensure semantic HTML
<button onClick={handleClick}>Submit</button>

// For custom elements, add keyboard handlers
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick()
    }
  }}
>
  Custom Button
</div>
```

**Test:**
- Navigate entire page using only keyboard
- All functionality should be accessible
- Tab order should be logical

---

## ✅ ARIA Labels

**Requirement:** Icon buttons and non-text elements must have accessible names

**How to implement:**
```tsx
// Icon button with aria-label
<Button aria-label="Refresh data">
  <RefreshCw className="w-4 h-4" />
</Button>

// Icon button with aria-labelledby
<Button aria-labelledby="refresh-label">
  <RefreshCw className="w-4 h-4" />
  <span id="refresh-label" className="sr-only">Refresh data</span>
</Button>

// SVG with title
<svg aria-hidden="false">
  <title>Refresh icon</title>
  <path d="..." />
</svg>
```

**Common mistakes:**
- ❌ Icon button without label
- ❌ `aria-label` on non-interactive elements
- ❌ Redundant labels (icon + visible text + aria-label)

**Manual check:**
```bash
pnpm run test:e2e:accessibility -- -g "ARIA labels"
```

---

## ✅ Form Labels

**Requirement:** All form inputs must have associated labels

**How to implement:**
```tsx
// Method 1: Using htmlFor (preferred)
<Label htmlFor="email">Email</Label>
<Input id="email" type="email" />

// Method 2: Wrapping label
<Label>
  Email
  <Input type="email" />
</Label>

// Method 3: aria-label (use sparingly)
<Input
  type="email"
  aria-label="Email address"
  placeholder="Enter email"
/>
```

**Validation errors:**
```tsx
<Label htmlFor="email">Email</Label>
<Input
  id="email"
  type="email"
  aria-describedby={hasError ? "email-error" : undefined}
/>
{hasError && (
  <span id="email-error" role="alert" className="text-error">
    Please enter a valid email address
  </span>
)}
```

**Manual check:**
```bash
pnpm run test:e2e:accessibility -- -g "form inputs"
```

---

## ✅ Modal Focus Management

**Requirement:** Modals must trap focus and return focus on close

**How to implement:**
```tsx
// Using Radix UI Dialog (already handles focus trap)
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogTitle>Modal Title</DialogTitle>
    <DialogDescription>Modal description</DialogDescription>
    {/* Interactive content */}
  </DialogContent>
</Dialog>

// Keyboard support
// - Escape key closes modal (handled by Radix)
// - Focus returns to trigger element (handled by Radix)
// - Tab cycles through modal elements only (focus trap)
```

**Test:**
- Open modal and press Tab repeatedly
- Focus should stay within modal
- Press Escape to close
- Focus should return to trigger button

**Manual check:**
```bash
pnpm run test:e2e:accessibility -- -g "Escape key"
```

---

## ✅ Color Contrast

**Requirement:** Text must meet WCAG AA contrast ratios

**Ratios:**
- Normal text (< 18px): 4.5:1
- Large text (≥ 18px or ≥ 14px bold): 3.0:1
- UI components: 3.0:1

**Colors approved for text on white:**
- Primary (`#4ECFA5`): ✅ 2.7:1 (use for large text only)
- Primary Dark (`#2D9B78`): ✅ 5.2:1 (safe for all text)
- Foreground (`#2A2D35`): ✅ 15.3:1 (safe for all text)
- Muted Foreground (`#6B7280`): ✅ 5.9:1 (safe for all text)

**How to check:**
```bash
# Use online tools
https://webaim.org/resources/contrastchecker/

# Or run automated test
pnpm run test:e2e:accessibility -- -g "color contrast"
```

**Manual check:**
- View page in grayscale (Chrome DevTools > Rendering > Emulate vision deficiencies)
- Text should still be readable

---

## ✅ Skip Link

**Requirement:** Provide skip to main content link for keyboard users

**How to implement:**
```tsx
// In layout/header
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground"
>
  Skip to main content
</a>

// In main content area
<main id="main-content" tabIndex={-1}>
  {/* Page content */}
</main>
```

**Test:**
- Press Tab immediately after page load
- Skip link should become visible
- Pressing Enter should jump to main content

---

## ✅ Semantic HTML

**Requirement:** Use semantic HTML elements

**Correct usage:**
```tsx
// ✅ Good
<nav>
  <Link href="/">Home</Link>
</nav>

<main>
  <h1>Page Title</h1>
  <article>
    <h2>Section Title</h2>
    <p>Content</p>
  </article>
</main>

<footer>
  <p>© 2025 IOFold</p>
</footer>

// ❌ Bad
<div className="nav">
  <div onClick={goHome}>Home</div>
</div>

<div className="main">
  <div className="title">Page Title</div>
  <div>
    <div>Section Title</div>
    <div>Content</div>
  </div>
</div>
```

---

## ✅ Heading Hierarchy

**Requirement:** Headings must be in logical order (h1 → h2 → h3)

**How to implement:**
```tsx
<h1>Page Title</h1>           {/* One h1 per page */}
  <h2>Main Section</h2>
    <h3>Subsection</h3>
    <h3>Another Subsection</h3>
  <h2>Another Main Section</h2>
    <h3>Subsection</h3>

// ❌ Don't skip levels
<h1>Title</h1>
  <h3>Skipped h2!</h3>         {/* Bad - use h2 */}
```

**Manual check:**
- Use HeadingsMap browser extension
- Or check Chrome DevTools > Accessibility tree

---

## ✅ Loading States

**Requirement:** Announce loading states to screen readers

**How to implement:**
```tsx
// Loading spinner
{isLoading && (
  <div role="status" aria-live="polite">
    <Loader2 className="animate-spin" />
    <span className="sr-only">Loading...</span>
  </div>
)}

// Disabled button during loading
<Button disabled={isLoading} aria-busy={isLoading}>
  {isLoading ? (
    <>
      <Loader2 className="animate-spin mr-2" />
      Loading...
    </>
  ) : (
    'Submit'
  )}
</Button>
```

---

## 🔧 Tools

### Browser Extensions
- **axe DevTools** - Automated accessibility testing
- **WAVE** - Visual accessibility evaluation
- **HeadingsMap** - Check heading structure
- **Lighthouse** - Chrome DevTools audit

### Command Line
```bash
# Run all accessibility tests
pnpm run test:e2e:accessibility

# Run specific test
pnpm run test:e2e:accessibility -- -g "focus indicators"

# Run in UI mode (debug)
pnpm run test:e2e:ui

# Run in headed mode (watch browser)
pnpm run test:e2e:headed -- e2e/04-accessibility
```

### Screen Readers
- **macOS:** VoiceOver (Cmd + F5)
- **Windows:** NVDA (free) or JAWS
- **Linux:** Orca

---

## 📚 Resources

### WCAG Guidelines
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [WCAG 2.1 Level AA Checklist](https://webaim.org/standards/wcag/checklist)

### ARIA Patterns
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [ARIA in HTML](https://www.w3.org/TR/html-aria/)

### Testing
- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing)
- [Testing Library Query Priority](https://testing-library.com/docs/queries/about/#priority)

### Design
- [Accessible Color Palette Builder](https://toolness.github.io/accessible-color-matrix/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

---

## 🚨 Common Mistakes to Avoid

1. **Using divs as buttons**
   - Use `<button>` or add proper ARIA roles + keyboard handlers

2. **Missing alt text on images**
   - All `<img>` should have `alt` attribute
   - Decorative images: `alt=""`

3. **Placeholder as label**
   - Placeholder disappears on input
   - Always use explicit `<label>`

4. **Color-only indicators**
   - Don't rely on color alone (e.g., red error text)
   - Add icons or text labels

5. **Auto-playing media**
   - Provide pause/stop controls
   - Don't auto-play audio

6. **Fixed time limits**
   - Allow users to extend time limits
   - Provide pause/stop for auto-advancing content

7. **Keyboard traps**
   - Users must be able to navigate away
   - Modals should trap focus intentionally

8. **Empty links/buttons**
   - All interactive elements need accessible names
   - Use `aria-label` for icon-only elements

---

## ✨ IOFold-Specific Notes

### Brand Colors (Mint Theme)
- Primary: `#4ECFA5` - Use for large text (≥18px) on white
- Primary Dark: `#2D9B78` - Safe for all text sizes
- Always test contrast before using custom colors

### Component Library
- All components in `/components/ui/` have built-in focus styles
- Button component handles loading states with `aria-busy`
- Dialog component has focus trap built-in (Radix UI)

### Keyboard Shortcuts
Document all shortcuts using `<kbd>` elements:
```tsx
<div className="flex items-center gap-2">
  <kbd className="px-2 py-1 bg-gray-100 rounded border">F</kbd>
  <span>Toggle filters</span>
</div>
```

### Testing Workflow
1. Run automated tests: `pnpm run test:e2e:accessibility`
2. Manual keyboard navigation test
3. Screen reader spot check (critical paths)
4. Visual review in grayscale mode
5. Lighthouse audit (aim for 95+ score)

---

**Last Updated:** 2025-11-30
