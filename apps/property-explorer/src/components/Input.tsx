import {
  forwardRef,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { PE, MOTION } from "../styles/pe-chrome";

// Field height 34 (textarea 76), padding 0 11, radius 6, line-14 edge, a fill
// barely off the surface, text 12.5 in t2, placeholder t6.
//
// Focus adds the blue border and the focus glow and NOTHING MOVES — no size
// change, no shadow that shifts layout. `invalid` gets the error border and a
// faint error fill.
//
// SPEC section 1 also asks for an error line below the field NAMING THE
// EXPECTED FORMAT. No field in this app currently reports a format error, so
// that component is absent rather than shipped-and-never-rendered. When one
// does, the line is required and "Invalid" alone will not satisfy it.

const base: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  fontFamily: PE.ui,
  fontSize: 14.5,
  lineHeight: 1.45,
  color: PE.t2,
  background: "rgba(255,255,255,.02)",
  border: `1px solid ${PE.line14}`,
  borderRadius: PE.rTouch,
  outline: "none",
  transition: `border-color ${MOTION.state}, box-shadow ${MOTION.state}`,
};

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ style, invalid, ...rest }, ref) {
  return (
    <input
      {...rest}
      ref={ref}
      data-pe="input"
      data-invalid={invalid ? "1" : undefined}
      data-ss-motion=""
      style={{
        ...base,
        height: PE.hField,
        padding: "0 11px",
        ...(invalid
          ? { borderColor: PE.err, background: "color-mix(in oklab, var(--ss-err) 5%, transparent)" }
          : null),
        ...style,
      }}
    />
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function TextArea({ style, invalid, ...rest }, ref) {
  return (
    <textarea
      {...rest}
      ref={ref}
      data-pe="textarea"
      data-invalid={invalid ? "1" : undefined}
      data-ss-motion=""
      style={{
        ...base,
        minHeight: 76,
        padding: "8px 11px",
        resize: "none",
        ...(invalid
          ? { borderColor: PE.err, background: "color-mix(in oklab, var(--ss-err) 5%, transparent)" }
          : null),
        ...style,
      }}
    />
  );
});

/** Label above value — the reason the cards scan. 10/600/.13em uppercase in
 *  t6 over a 13.5/400 value. */
export function Field({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div data-pe="field">
      <label
        htmlFor={htmlFor}
        style={{
          display: "block",
          marginBottom: 3,
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: ".13em",
          textTransform: "uppercase",
          color: PE.t6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
