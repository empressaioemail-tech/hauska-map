/**
 * A minimal MapLibre expression evaluator — the DIVERGENCE-TEST instrument.
 *
 * DEV_PROCESS 2.4: when one rule has two implementations, the divergence test IS
 * the control. The land-use and FEMA classifiers each exist twice — once as a
 * plain-JS function (legend, tooltips, reports) and once as a MapLibre
 * expression (GPU paint) — so the tests need to actually RUN the expression
 * rather than eyeball it. This evaluates the small operator subset those two
 * expressions use, and nothing else.
 *
 * It is deliberately NOT a general MapLibre implementation and is not exported
 * from the package index. An unsupported operator THROWS rather than returning a
 * plausible value: a silently-degrading evaluator would make the divergence test
 * fail open, which is the exact defect class this repo hunts.
 */

const OPS = new Set([
  "literal",
  "get",
  "coalesce",
  "to-string",
  "upcase",
  "downcase",
  "slice",
  "index-of",
  "==",
  "!=",
  "any",
  "all",
  "!",
  "case",
  "match",
]);

/** True when `node` looks like an expression array rather than a literal value. */
function isExpr(node) {
  return Array.isArray(node) && typeof node[0] === "string" && OPS.has(node[0]);
}

/**
 * Evaluate a MapLibre expression against a feature's properties.
 * @param {unknown} node        the expression (or a literal)
 * @param {Record<string, unknown>} props  feature properties
 * @returns {unknown}
 */
export function evalExpr(node, props) {
  if (!isExpr(node)) {
    if (Array.isArray(node)) {
      throw new Error(`expr-eval: unsupported operator "${String(node[0])}"`);
    }
    return node;
  }
  const [op, ...args] = node;
  const ev = (n) => evalExpr(n, props);

  switch (op) {
    case "literal":
      return args[0];

    case "get": {
      const key = ev(args[0]);
      const v = props?.[key];
      return v === undefined ? null : v;
    }

    case "coalesce": {
      for (const a of args) {
        const v = ev(a);
        if (v !== null && v !== undefined) return v;
      }
      return null;
    }

    case "to-string": {
      const v = ev(args[0]);
      if (v === null || v === undefined) return "";
      return typeof v === "string" ? v : String(v);
    }

    case "upcase":
      return String(ev(args[0])).toUpperCase();

    case "downcase":
      return String(ev(args[0])).toLowerCase();

    case "slice": {
      const input = ev(args[0]);
      const start = ev(args[1]);
      const end = args.length > 2 ? ev(args[2]) : undefined;
      return end === undefined ? input.slice(start) : input.slice(start, end);
    }

    case "index-of": {
      const needle = ev(args[0]);
      const haystack = ev(args[1]);
      const from = args.length > 2 ? ev(args[2]) : 0;
      return haystack.indexOf(needle, from);
    }

    case "==":
      return ev(args[0]) === ev(args[1]);

    case "!=":
      return ev(args[0]) !== ev(args[1]);

    case "!":
      return !ev(args[0]);

    case "any":
      return args.some((a) => ev(a) === true);

    case "all":
      return args.every((a) => ev(a) === true);

    case "case": {
      // [ "case", cond1, out1, cond2, out2, …, fallback ]
      if (args.length < 3 || args.length % 2 === 0) {
        throw new Error("expr-eval: malformed case (needs pairs plus a fallback)");
      }
      for (let i = 0; i + 1 < args.length - 1; i += 2) {
        if (ev(args[i]) === true) return ev(args[i + 1]);
      }
      return ev(args[args.length - 1]);
    }

    case "match": {
      // [ "match", input, label|labels, out, …, fallback ]
      if (args.length < 4 || args.length % 2 !== 0) {
        throw new Error("expr-eval: malformed match (needs input, pairs, fallback)");
      }
      const input = ev(args[0]);
      for (let i = 1; i + 1 < args.length - 1; i += 2) {
        const label = args[i];
        const hit = Array.isArray(label) ? label.includes(input) : label === input;
        if (hit) return ev(args[i + 1]);
      }
      return ev(args[args.length - 1]);
    }

    default:
      throw new Error(`expr-eval: unsupported operator "${op}"`);
  }
}
