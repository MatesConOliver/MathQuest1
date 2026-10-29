import { FlagLogic, FlagLogicGroup } from '@/types/game';

/**
 * Normalizes flag strings for comparison (trimmed and case-insensitive check).
 */
export function normalizeFlag(f: string): string {
  return typeof f === 'string' ? f.trim().toUpperCase() : '';
}

/**
 * Formats a FlagLogic structure into a human-readable expression string like:
 * "(a OR b) AND c" or "(a AND b AND c) OR d"
 */
export function formatFlagLogic(logic: FlagLogic): string {
  if (!logic.groups || logic.groups.length === 0) return '';
  const rootOperator = logic.rootOp || (logic as any).rootOperator || 'AND';

  const groupStrings = logic.groups
    .map((grp) => {
      const flags = grp.flags.filter((f) => f && f.trim() !== '');
      if (flags.length === 0) return '';
      if (flags.length === 1) return flags[0].trim();
      const groupOp = grp.op || (grp as any).operator || 'AND';
      return `(${flags.map((f) => f.trim()).join(` ${groupOp} `)})`;
    })
    .filter(Boolean);

  if (groupStrings.length === 0) return '';
  if (groupStrings.length === 1) return groupStrings[0];
  return groupStrings.join(` ${rootOperator} `);
}

/**
 * Parses a boolean flag expression string (e.g. "(a OR b) AND c", "(a AND b) OR d", or "A, B")
 * into a structured FlagLogic object.
 */
export function parseFlagExpression(expr: string): FlagLogic {
  if (!expr || !expr.trim()) {
    return { rootOp: 'AND', groups: [] };
  }

  const clean = expr.trim();

  // Split top-level by matching parentheses
  const splitTopLevel = (str: string, op: 'OR' | 'AND'): string[] | null => {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    const regex = op === 'OR' ? /^(\s*OR\s*|\s*\|\|\s*)/i : /^(\s*AND\s*|\s*&&\s*)/i;

    let i = 0;
    while (i < str.length) {
      if (str[i] === '(') depth++;
      else if (str[i] === ')') depth--;

      if (depth === 0) {
        const match = str.slice(i).match(regex);
        if (match) {
          parts.push(current.trim());
          current = '';
          i += match[0].length;
          continue;
        }
      }
      current += str[i];
      i++;
    }
    if (current.trim()) parts.push(current.trim());
    return parts.length > 1 ? parts : null;
  };

  const orTop = splitTopLevel(clean, 'OR');
  const andTop = splitTopLevel(clean, 'AND');

  const extractFlags = (sub: string): string[] => {
    return sub
      .replace(/[()]/g, '')
      .split(/\s*(?:AND|OR|&&|\|\||,)\s*/i)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  };

  const detectGroupOp = (sub: string): 'AND' | 'OR' => {
    if (/\bOR\b|\|\|/i.test(sub)) return 'OR';
    return 'AND';
  };

  if (orTop && (!andTop || orTop.length >= andTop.length)) {
    // Root is OR
    const groups: FlagLogicGroup[] = orTop.map((part, idx) => ({
      id: `g_${idx + 1}`,
      op: detectGroupOp(part),
      flags: extractFlags(part),
    }));
    return {
      rootOp: 'OR',
      groups,
      expressionText: clean,
    };
  }

  // Root is AND (default)
  const andParts = andTop || clean.split(',').map((s) => s.trim()).filter(Boolean);
  const groups: FlagLogicGroup[] = andParts.map((part, idx) => ({
    id: `g_${idx + 1}`,
    op: detectGroupOp(part),
    flags: extractFlags(part),
  }));

  return {
    rootOp: 'AND',
    groups,
    expressionText: clean,
  };
}


/**
 * Evaluates a raw boolean expression string against player flags.
 * Supports: identifiers, AND, OR, &&, ||, and parentheses ( ).
 * Example: "(FLAG_A OR FLAG_B) AND FLAG_C"
 * Example: "(A AND B AND C) OR D"
 */
export function evaluateBooleanExpression(expr: string, playerFlags: string[]): boolean {
  if (!expr || expr.trim() === '') return true;

  const playerSet = new Set(playerFlags.map(normalizeFlag));

  // Tokenize
  const rawTokens = expr
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .replace(/&&/g, ' AND ')
    .replace(/\|\|/g, ' OR ')
    .split(/\s+/)
    .filter(Boolean);

  if (rawTokens.length === 0) return true;

  // Recursive descent parser
  // Grammar:
  // Expression -> Term (OR Term)*
  // Term       -> Factor (AND Factor)*
  // Factor     -> IDENTIFIER | ( Expression )

  let index = 0;

  function peek(): string | null {
    return index < rawTokens.length ? rawTokens[index] : null;
  }

  function consume(): string {
    return rawTokens[index++];
  }

  function parseFactor(): boolean {
    const token = peek();
    if (!token) return true;

    if (token === '(') {
      consume(); // eat '('
      const val = parseExpression();
      if (peek() === ')') {
        consume(); // eat ')'
      }
      return val;
    }

    const identifier = consume();
    const normalized = normalizeFlag(identifier);
    return playerSet.has(normalized);
  }

  function parseTerm(): boolean {
    let result = parseFactor();
    while (peek()?.toUpperCase() === 'AND') {
      consume(); // eat 'AND'
      const right = parseFactor();
      result = result && right;
    }
    return result;
  }

  function parseExpression(): boolean {
    let result = parseTerm();
    while (peek()?.toUpperCase() === 'OR') {
      consume(); // eat 'OR'
      const right = parseTerm();
      result = result || right;
    }
    return result;
  }

  try {
    return parseExpression();
  } catch (err) {
    console.error('Failed to parse flag boolean expression:', expr, err);
    return false;
  }
}

/**
 * Main evaluation entry point: evaluates FlagLogic structure, raw string expression,
 * or legacy string[] list of flags against player character story flags.
 */
export function evaluateFlagLogic(
  logic: FlagLogic | string | string[] | undefined | null,
  playerFlags: string[] = []
): boolean {
  if (!logic) return true;

  const playerSet = new Set(playerFlags.map(normalizeFlag));

  // 1. Legacy string[] list: All flags are required (AND logic by default)
  if (Array.isArray(logic)) {
    if (logic.length === 0) return true;
    return logic.every((flag) => {
      const clean = normalizeFlag(flag);
      return !clean || playerSet.has(clean);
    });
  }

  // 2. String expression (e.g. "(a OR b) AND c")
  if (typeof logic === 'string') {
    return evaluateBooleanExpression(logic, playerFlags);
  }

  // 3. Structured FlagLogic object
  if (typeof logic === 'object' && logic.groups) {
    // If raw expression text exists, use it or evaluate groups
    if (logic.groups.length === 0) {
      return logic.expressionText ? evaluateBooleanExpression(logic.expressionText, playerFlags) : true;
    }

    const groupResults = logic.groups.map((group) => {
      const cleanFlags = group.flags.map(normalizeFlag).filter(Boolean);
      if (cleanFlags.length === 0) return true;

      if (group.op === 'OR') {
        return cleanFlags.some((f) => playerSet.has(f));
      } else {
        // AND
        return cleanFlags.every((f) => playerSet.has(f));
      }
    });

    if (logic.rootOp === 'OR') {
      return groupResults.some(Boolean);
    } else {
      // AND
      return groupResults.every(Boolean);
    }
  }

  return true;
}
