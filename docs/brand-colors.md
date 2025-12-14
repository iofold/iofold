# IOFOLD LABS BRAND COLORS

## Primary Brand
| Name | Hex | Usage |
|------|-----|-------|
| Seafoam | #4ECDC4 | Primary brand color, CTAs, interactive elements |
| Forest Green | #1B5E20 | Deep brand accent, gradient endpoints |

## Cool Palette
| Name | Hex | Usage |
|------|-----|-------|
| Mint Light | #A8E6CF | Primary surfaces, button backgrounds |
| Mint Cream | #C8F7C5 | Highlights, hover states |
| Dusty Blue | #5C9EAD | Info states, links, secondary accents |

## Warm Palette
| Name | Hex | Usage |
|------|-----|-------|
| Coral Blush | #FF6B9D | Secondary brand color, attention accents |
| Coral Light | #FF8A8A | Soft warnings, notifications |
| Peach | #FFAB76 | Warm highlights, tertiary CTAs |

## Semantic Colors
| Name | Hex | Alias | Usage |
|------|-----|-------|-------|
| Success | #4CAF50 | Sage | Success states |
| Warning | #FFC107 | Gold | Warning states |
| Error | #D84315 | Rust | Error states |
| Info | #5C9EAD | Dusty Blue | Info states |

## Dark Mode Surfaces (Recommended)
| Name | Hex | Usage |
|------|-----|-------|
| Page BG | #0D1117 | Page background |
| Card BG | #161B22 | Card surfaces |
| Elevated | #21262D | Elevated elements |
| Borders | #30363D | Border color |

## Neutrals
| Name | Hex | Usage |
|------|-----|-------|
| Charcoal | #1A1A2E | Dark mode base, primary text on light |
| Slate Teal | #37474F | Headers, dark UI elements |
| Warm Clay | #8D6E63 | Tertiary, earthy accents |
| Sand Beige | #C9B8A8 | Paper textures, muted backgrounds |

## Key Gradients
| Name | From | To | Usage |
|------|------|-----|-------|
| Primary | #4ECDC4 | #1B5E20 | Seafoam to Forest |
| Accent | #FF6B9D | #D84315 | Coral to Rust |
| Warm | #FFC107 | #D84315 | Gold to Rust |

## Style Notes
- Dark mode first design
- Use muted backgrounds, saturated accents
- Grain/noise overlay at 20-30% opacity for texture
- Soft orb glows behind content for depth

---

## CSS Variables Reference

```css
:root {
  /* Primary Brand */
  --color-seafoam: #4ECDC4;
  --color-forest: #1B5E20;

  /* Cool Palette */
  --color-mint-light: #A8E6CF;
  --color-mint-cream: #C8F7C5;
  --color-dusty-blue: #5C9EAD;

  /* Warm Palette */
  --color-coral-blush: #FF6B9D;
  --color-coral-light: #FF8A8A;
  --color-peach: #FFAB76;

  /* Semantic */
  --color-success: #4CAF50;
  --color-warning: #FFC107;
  --color-error: #D84315;
  --color-info: #5C9EAD;

  /* Neutrals */
  --color-charcoal: #1A1A2E;
  --color-slate-teal: #37474F;
  --color-warm-clay: #8D6E63;
  --color-sand-beige: #C9B8A8;
}

.dark {
  /* Dark Mode Surfaces */
  --color-bg-page: #0D1117;
  --color-bg-card: #161B22;
  --color-bg-elevated: #21262D;
  --color-border: #30363D;
}
```

## Tailwind Config

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        // Primary Brand
        seafoam: '#4ECDC4',
        forest: '#1B5E20',

        // Cool Palette
        'mint-light': '#A8E6CF',
        'mint-cream': '#C8F7C5',
        'dusty-blue': '#5C9EAD',

        // Warm Palette
        'coral-blush': '#FF6B9D',
        'coral-light': '#FF8A8A',
        peach: '#FFAB76',

        // Semantic
        success: '#4CAF50',
        warning: '#FFC107',
        error: '#D84315',
        info: '#5C9EAD',

        // Neutrals
        charcoal: '#1A1A2E',
        'slate-teal': '#37474F',
        'warm-clay': '#8D6E63',
        'sand-beige': '#C9B8A8',

        // Dark Mode Surfaces
        'dark-page': '#0D1117',
        'dark-card': '#161B22',
        'dark-elevated': '#21262D',
        'dark-border': '#30363D',
      },
    },
  },
}
```
