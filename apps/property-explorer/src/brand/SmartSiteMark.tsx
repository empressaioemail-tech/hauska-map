// apps/property-explorer/src/brand/SmartSiteMark.tsx
//
// Smart Site brand MARK — the crosshair glyph (circle + 4 ticks + gold center
// dot, white strokes). Inlined SVG (no external fetch) so it takes a `size` /
// `className` prop and renders crisply at 12-15px (workbench dock) and ~24px
// (corner brand chip). Geometry + colors are 1:1 with the brand package
// source: logo/smart-site-mark-crosshair.svg (viewBox 0 0 76 76).

export function SmartSiteMark({
  size = 24,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 76 76"
      width={size}
      height={size}
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ display: "block", flexShrink: 0 }}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="38" cy="38" r="30" stroke="#ffffff" strokeWidth="4" />
      <circle cx="38" cy="38" r="6" fill="#E8963B" />
      <line x1="38" y1="0" x2="38" y2="18" stroke="#ffffff" strokeWidth="4" />
      <line x1="38" y1="58" x2="38" y2="76" stroke="#ffffff" strokeWidth="4" />
      <line x1="0" y1="38" x2="18" y2="38" stroke="#ffffff" strokeWidth="4" />
      <line x1="58" y1="38" x2="76" y2="38" stroke="#ffffff" strokeWidth="4" />
    </svg>
  );
}
