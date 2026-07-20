import os

# Create an SVG representation of the requested macOS app icon
# Dimensions: 1024x1024 (standard macOS icon base size)
# Background: White (#ffffff)
# Shape: macOS squircle with standard corner radius or rounded rect
# Content:
# - Text: ".md" in black, bold, rounded font style
# - Icon: Simplified Eye drawn with vibrant Apple/Google rainbow colors (Blue, Red, Yellow, Green, Violet/Cyan)

svg_content = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background subtle shadow/border for macOS depth -->
    <filter id="drop-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.12"/>
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.08"/>
    </filter>

    <!-- Vibrant Colorful Gradients for the Eye elements (Apple/Google inspired palette) -->
    <linearGradient id="grad-blue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4285F4"/>
      <stop offset="100%" stop-color="#2B66C9"/>
    </linearGradient>

    <linearGradient id="grad-red" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EA4335"/>
      <stop offset="100%" stop-color="#FF6B5B"/>
    </linearGradient>

    <linearGradient id="grad-yellow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FBBC05"/>
      <stop offset="100%" stop-color="#FFA000"/>
    </linearGradient>

    <linearGradient id="grad-green" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34A853"/>
      <stop offset="100%" stop-color="#0F9D58"/>
    </linearGradient>

    <linearGradient id="grad-purple" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#AF52DE"/>
      <stop offset="100%" stop-color="#5856D6"/>
    </linearGradient>

    <!-- Eye stroke arc gradient -->
    <linearGradient id="eye-arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#4285F4"/>
      <stop offset="25%" stop-color="#EA4335"/>
      <stop offset="50%" stop-color="#FBBC05"/>
      <stop offset="75%" stop-color="#34A853"/>
      <stop offset="100%" stop-color="#AF52DE"/>
    </linearGradient>
  </defs>

  <!-- Canvas Base (White macOS Squircle Icon Frame) -->
  <g filter="url(#drop-shadow)">
    <rect x="96" y="96" width="832" height="832" rx="185" ry="185" fill="#FFFFFF"/>
    <!-- Subtle Inner Border to give macOS polish -->
    <rect x="96" y="96" width="832" height="832" rx="185" ry="185" fill="none" stroke="#000000" stroke-opacity="0.06" stroke-width="4"/>
  </g>

  <!-- MAIN CONTENT GROUP -->
  <g transform="translate(512, 512)">
    
    <!-- COLORFUL EYE ILLUSTRATION (Top Center) -->
    <g transform="translate(0, -110)">
      
      <!-- Upper Eye Lid / Arc (Vibrant Multi-color Gradient Stroke) -->
      <path d="M -180,0 Q 0,-160 180,0" 
            fill="none" 
            stroke="url(#eye-arc-grad)" 
            stroke-width="36" 
            stroke-linecap="round"/>

      <!-- Lower Eye Lid / Arc (Complementary Arc) -->
      <path d="M -180,0 Q 0,160 180,0" 
            fill="none" 
            stroke="url(#eye-arc-grad)" 
            stroke-width="36" 
            stroke-linecap="round"
            opacity="0.85"/>

      <!-- Iris & Pupil: Multi-layered Colorful Concentric Circles -->
      <!-- Outer Rainbow Ring -->
      <circle cx="0" cy="0" r="75" fill="url(#grad-blue)" />
      
      <!-- Middle Ring -->
      <path d="M 0 0 L 75 0 A 75 75 0 0 1 0 75 Z" fill="url(#grad-red)" />
      <path d="M 0 0 L 0 75 A 75 75 0 0 1 -75 0 Z" fill="url(#grad-yellow)" />
      <path d="M 0 0 L -75 0 A 75 75 0 0 1 0 -75 Z" fill="url(#grad-green)" />
      <path d="M 0 0 L 0 -75 A 75 75 0 0 1 75 0 Z" fill="url(#grad-purple)" />

      <!-- Center Pupil -->
      <circle cx="0" cy="0" r="38" fill="#1D1D1F" />

      <!-- Catchlight / Sparkle (Apple Style Highlight) -->
      <circle cx="-16" cy="-16" r="12" fill="#FFFFFF" opacity="0.9" />
      <circle cx="16" cy="16" r="6" fill="#FFFFFF" opacity="0.7" />

      <!-- Playful Eyelash / Accent Color Dots -->
      <circle cx="-210" cy="-20" r="10" fill="#4285F4"/>
      <circle cx="210" cy="-20" r="10" fill="#AF52DE"/>
      <circle cx="0" cy="-115" r="9" fill="#EA4335"/>
    </g>

    <!-- TEXT SECTION (".md" - Bold, Rounded, Black) -->
    <g transform="translate(0, 230)">
      <text x="0" y="0" 
            font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Rounded', 'Arial Rounded MT Bold', 'Nunito', sans-serif" 
            font-size="165" 
            font-weight="800" 
            fill="#1D1D1F" 
            text-anchor="middle" 
            letter-spacing="-2">.md</text>
    </g>

  </g>
</svg>
'''

output_path = "macos_md_eye_icon.svg"
with open(output_path, "w", encoding="utf-8") as f:
    f.write(svg_content)

print(f"Generated SVG file successfully at: {output_path}")
