export default function SunGlyph() {
  // Halve zon op de horizon met stralen (PO 2026-09-25 live).
  return <svg class="sun-glyph" viewBox="0 2 20 10" aria-hidden="true">
    <path class="sun-glyph-rays" d="M4.74 9.08L2.86 8.40M6.79 6.41L5.64 4.77M10.00 5.40L10.00 3.40M13.21 6.41L14.36 4.77M15.26 9.08L17.14 8.40" />
    <path class="sun-glyph-horizon" d="M1 11h18" />
    <path class="sun-glyph-disc" d="M6 11a4 4 0 0 1 8 0Z" />
  </svg>
}
