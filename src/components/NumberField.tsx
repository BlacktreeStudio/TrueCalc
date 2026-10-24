'use client';

import { useState } from 'react';

type NumberFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number;
  onValueChange: (value: number) => void;
};

const parse = (text: string) => (text.trim() === '' ? 0 : Number(text));

// Number input that keeps the text the user typed. Binding a plain <input type="number">
// to a number turns an emptied field straight back into "0", so the zero can't be deleted
// and typing then gives "07099". Here an empty field counts as 0 without showing it,
// leading zeros are dropped as you type ("07" -> "7", but "0.5" stays), and the field
// still follows changes made elsewhere (e.g. "Use current rates").
export default function NumberField({ value, onValueChange, onBlur, ...rest }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);

  // Value changed from outside: show it, unless it's what the field already says
  if (value !== lastValue) {
    setLastValue(value);
    if (parse(text) !== value) setText(String(value));
  }

  return (
    <input
      {...rest}
      type="number"
      value={text}
      onChange={(e) => {
        const next = e.target.value.replace(/^(-?)0+(?=\d)/, '$1');
        setText(next);
        const n = parse(next);
        if (!Number.isNaN(n)) {
          setLastValue(n);
          onValueChange(n);
        }
      }}
      onBlur={(e) => {
        // Leaving an empty field shows the 0 it stands for
        if (text.trim() === '') setText(String(value));
        onBlur?.(e);
      }}
    />
  );
}
