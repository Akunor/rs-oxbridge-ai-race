// A tiny, safe arithmetic evaluator (no eval). Gives the agent exact maths, so totals and
// currency conversions come out right instead of being "guessed" by the model.
// Supports + - * / ( ) decimals, unary minus and round(x, places).

export function calculate(expression: string): number {
  const src = expression.replace(/,(?=\d{3}\b)/g, "").trim();
  if (src.length > 500) throw new Error("Expression too long");
  let i = 0;
  const peek = () => src[i];
  const skip = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const expect = (ch: string) => {
    skip();
    if (src[i] !== ch) throw new Error(`Expected "${ch}" at position ${i}`);
    i++;
  };

  function primary(): number {
    skip();
    const ch = peek();
    if (ch === "(") {
      i++;
      const v = expr();
      expect(")");
      return v;
    }
    if (ch === "-") {
      i++;
      return -primary();
    }
    if (ch === "+") {
      i++;
      return primary();
    }
    const fn = src.slice(i).match(/^round\s*\(/i);
    if (fn) {
      i += fn[0].length;
      const value = expr();
      let places = 0;
      skip();
      if (peek() === ",") {
        i++;
        places = expr();
      }
      expect(")");
      const f = 10 ** Math.max(0, Math.min(12, Math.round(places)));
      return Math.round((value + Number.EPSILON) * f) / f;
    }
    const num = src.slice(i).match(/^\d+(?:\.\d+)?(?:e[+-]?\d+)?|^\.\d+/i);
    if (!num) throw new Error(`Unexpected "${ch ?? "end"}" at position ${i}`);
    i += num[0].length;
    return Number(num[0]);
  }

  function term(): number {
    let v = primary();
    for (;;) {
      skip();
      const ch = peek();
      if (ch === "*" || ch === "/") {
        i++;
        const r = primary();
        v = ch === "*" ? v * r : v / r;
      } else return v;
    }
  }

  function expr(): number {
    let v = term();
    for (;;) {
      skip();
      const ch = peek();
      if (ch === "+" || ch === "-") {
        i++;
        const r = term();
        v = ch === "+" ? v + r : v - r;
      } else return v;
    }
  }

  const value = expr();
  skip();
  if (i < src.length) throw new Error(`Unexpected "${src[i]}" at position ${i}`);
  if (!Number.isFinite(value)) throw new Error("Result is not a finite number");
  return value;
}
