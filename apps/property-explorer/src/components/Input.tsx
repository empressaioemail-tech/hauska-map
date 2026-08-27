import { forwardRef, type CSSProperties, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { PE } from "../styles/pe-chrome";

const field: CSSProperties = {
  fontFamily: PE.font,
  fontSize: 11.5,
  lineHeight: 1.45,
  color: PE.text,
  background: "rgba(154,166,178,0.08)",
  border: PE.border,
  borderRadius: PE.radiusCard,
  padding: "6px 8px",
  outline: "none",
};

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, ...rest }, ref) {
    return <input {...rest} ref={ref} data-pe="input" style={{ ...field, ...style }} />;
  },
);

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ style, ...rest }, ref) {
  return (
    <textarea
      {...rest}
      ref={ref}
      data-pe="textarea"
      style={{ ...field, resize: "none", ...style }}
    />
  );
});
