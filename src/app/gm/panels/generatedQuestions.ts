/*
export type GeneratedQuestion = {
  title: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  difficulty: number;
  tags: string[];
};
*/

export type GeneratedQuestion = [
  {
    title: "Functions 2.1: Axis of Symmetry",
    prompt: "Find the equation for the axis of symmetry of the quadratic function $f(x) = -2x^2 - 4x + 10$[cite: 51].",
    choices: [
      "$x = 2$",
      "$x = 1$",
      "$x = -1$",
      "$x = -2$"
    ],
    correctIndex: 2,
    difficulty: 2,
    tags: ["functions2"]
  },
  {
    title: "Functions 2.2: Solving by Factorisation",
    prompt: "Solve the quadratic equation $x^2 + 2x - 8 = 0$ by using factorisation[cite: 51].",
    choices: [
      "$x = -2, x = 4$",
      "$x = -4, x = 2$",
      "$x = -8, x = 1$",
      "$x = -1, x = 8$"
    ],
    correctIndex: 1,
    difficulty: 2,
    tags: ["functions2"]
  },
  {
    title: "Functions 2.3: Coordinates of the Vertex",
    prompt: "Determine the coordinates of the vertex for the quadratic function $f(x) = x^2 - 10x + 32$[cite: 51].",
    choices: [
      "$(-5, 107)$",
      "$(5, -7)$",
      "$(-5, 7)$",
      "$(5, 7)$"
    ],
    correctIndex: 3,
    difficulty: 2,
    tags: ["functions2", "quadratics", "paper1"]
  },
  {
    title: "Functions 2.4: Completing the Square",
    prompt: "Use the method of completing the square to solve the quadratic equation $x^2 + 4x - 3 = 0$[cite: 51].",
    choices: [
      "$x = -2 \\pm \\sqrt{7}$",
      "$x = 2 \\pm \\sqrt{7}$",
      "$x = -2 \\pm \\sqrt{3}$",
      "$x = -4 \\pm \\sqrt{19}$"
    ],
    correctIndex: 0,
    difficulty: 2,
    tags: ["functions2", "quadratics", "paper1"]
  },
  {
    title: "Functions 2.5: Minimum Value of a Quadratic",
    prompt: "Find the minimum value of the quadratic function $f(x) = x^2 + 6x + 8$[cite: 51].",
    choices: [
      "$-3$",
      "$8$",
      "$-1$",
      "$0$"
    ],
    correctIndex: 2,
    difficulty: 2,
    tags: ["functions2", "quadratics", "paper1"]
  },
  {
    title: "Functions 2.6: Sum of Roots",
    prompt: "Find the sum of the roots for the quadratic equation $2x^2 + 6x - 5 = 0$[cite: 51].",
    choices: [
      "$3$",
      "$-\\frac{5}{2}$",
      "$\\frac{5}{2}$",
      "$-3$"
    ],
    correctIndex: 3,
    difficulty: 2,
    tags: ["functions2", "quadratics", "roots"]
  },
  {
    title: "Functions 2.7: Product of Roots",
    prompt: "Find the product of the roots for the quadratic equation $x^2 = 1 - 3x$[cite: 51].",
    choices: [
      "$-1$",
      "$1$",
      "$-3$",
      "$3$"
    ],
    correctIndex: 0,
    difficulty: 2,
    tags: ["functions2", "quadratics", "roots"]
  },
  {
    title: "Functions 2.8: Polynomial Remainder",
    prompt: "Use the remainder theorem to find the remainder when $P(x) = 3x^2 + 5x - 5$ is divided by $x + 3$[cite: 51].",
    choices: [
      "$-17$",
      "$7$",
      "$37$",
      "$-5$"
    ],
    correctIndex: 1,
    difficulty: 2,
    tags: ["functions2", "polynomials", "remainder_theorem"]
  },
  {
    title: "Functions 2.9: Evaluating Remainder",
    prompt: "Find the remainder when $P(x) = 2x^3 - 3x^2 + 4x - 7$ is divided by $x - 2$[cite: 51].",
    choices: [
      "$5$",
      "$-27$",
      "$-7$",
      "$9$"
    ],
    correctIndex: 0,
    difficulty: 2,
    tags: ["functions2", "polynomials", "remainder_theorem"]
  },
  {
    title: "Functions 2.10: Unknown Coefficient",
    prompt: "Find the value of $k$ such that $3$ is a zero of $f(x) = x^3 + x^2 + kx + 1$[cite: 51].",
    choices: [
      "$k = \\frac{37}{3}$",
      "$k = -9$",
      "$k = -\\frac{37}{3}$",
      "$k = 12$"
    ],
    correctIndex: 2,
    difficulty: 2,
    tags: ["functions2", "polynomials", "factor_theorem"]
  },
  {
    title: "Functions 2.11: Sum of Reciprocal Roots",
    prompt: "The roots of the equation $x^2 + x + 4 = 0$ are $\\alpha$ and $\\beta$. Find the value of the expression $\\frac{1}{\\alpha} + \\frac{1}{\\beta}$[cite: 51].",
    choices: [
      "$-\\frac{1}{4}$",
      "$\\frac{1}{4}$",
      "$-4$",
      "$4$"
    ],
    correctIndex: 0,
    difficulty: 2,
    tags: ["functions2", "quadratics", "roots"]
  },
  {
    title: "Functions 2.12: Sum of Squared Roots",
    prompt: "If $\\alpha$ and $\\beta$ are the roots of the equation $3x^2 + 5x + 4 = 0$, find the value of $\\alpha^2 + \\beta^2$[cite: 51].",
    choices: [
      "$\\frac{49}{9}$",
      "$\\frac{1}{9}$",
      "$\\frac{25}{9}$",
      "$-\\frac{23}{9}$"
    ],
    correctIndex: 1,
    difficulty: 2,
    tags: ["functions2", "quadratics", "roots"]
  },
  {
    title: "Functions 2.13: Partial Fractions Constants",
    prompt: "Given that $\\frac{2x - 48}{x^2 - 9} = \\frac{A}{x + 3} + \\frac{B}{x - 3}$, find the values of $A$ and $B$[cite: 51].",
    choices: [
      "$A = -9, B = 7$",
      "$A = 7, B = -9$",
      "$A = -7, B = 9$",
      "$A = 9, B = -7$"
    ],
    correctIndex: 3,
    difficulty: 2,
    tags: ["functions2", "rational_functions", "partial_fractions"]
  },
  {
    title: "Functions 2.14: Higher Degree Remainder",
    prompt: "Use the remainder theorem to find the remainder when $P(x) = x^5 - 2x^4 + 3x^2 - 20x + 3$ is divided by $x + 1$[cite: 51].",
    choices: [
      "$23$",
      "$15$",
      "$-13$",
      "$-21$"
    ],
    correctIndex: 0,
    difficulty: 2,
    tags: ["functions2", "polynomials", "remainder_theorem"]
  },
  {
    title: "Functions 2.15: Absolute Value Inequality",
    prompt: "Solve the inequality $|x - 2| \\geq |2x + 1|$[cite: 51].",
    choices: [
      "$x \\leq -3 \\text{ or } x \\geq \\frac{1}{3}$",
      "$-3 \\leq x \\leq \\frac{1}{3}$",
      "$x \\leq -\\frac{1}{3} \\text{ or } x \\geq 3$",
      "$-\\frac{1}{3} \\leq x \\leq 3$"
    ],
    correctIndex: 1,
    difficulty: 2,
    tags: ["functions2", "inequalities", "absolute_value"]
  },
  {
    title: "Functions 2.16: Linear Rational Inequality",
    prompt: "Find the values of $x$ that solve this inequality: $\\frac{3x - 2}{5} + 3 \\geq \\frac{4x - 1}{3}$[cite: 51].",
    choices: [
      "$x \\leq 4$",
      "$x \\geq 4$",
      "$x \\leq -4$",
      "$x \\geq -4$"
    ],
    correctIndex: 0,
    difficulty: 2,
    tags: ["functions2", "inequalities", "paper1"]
  },
  {
    title: "Functions 2.17: Quadratic Inequality",
    prompt: "Find the values of $x$ for which $4x + 1 < x^2 + 4$[cite: 51].",
    choices: [
      "$1 < x < 3$",
      "$x < -3 \\text{ or } x > -1$",
      "$-1 < x < -3$",
      "$x < 1 \\text{ or } x > 3$"
    ],
    correctIndex: 3,
    difficulty: 2,
    tags: ["functions2", "inequalities", "quadratics"]
  },
  {
    title: "Functions 2.18: Absolute Value Rational Inequality",
    prompt: "Find all values of $x$ that satisfy the inequality $\\frac{2x}{|x - 1|} < 1$[cite: 51].",
    choices: [
      "$x < -1$",
      "$-1 < x < \\frac{1}{3}$",
      "$x < \\frac{1}{3}$",
      "$x > 1$"
    ],
    correctIndex: 2,
    difficulty: 2,
    tags: ["functions2", "inequalities", "absolute_value"]
  },
  {
    title: "Functions 2.19: Partial Fractions Decomposition",
    prompt: "Decompose the rational expression $\\frac{5x + 1}{x^2 + x - 2}$ into partial fractions[cite: 51].",
    choices: [
      "$\\frac{2}{x + 2} + \\frac{3}{x - 1}$",
      "$\\frac{3}{x + 2} + \\frac{2}{x - 1}$",
      "$\\frac{4}{x + 2} + \\frac{1}{x - 1}$",
      "$\\frac{1}{x + 2} + \\frac{4}{x - 1}$"
    ],
    correctIndex: 1,
    difficulty: 2,
    tags: ["functions2", "rational_functions", "partial_fractions"]
  },
  {
    title: "Functions 2.20: Finding Constant from Vertex",
    prompt: "Find the value of $c$ such that the vertex of the parabola $y = 3x^2 - 8x + c$ is $(\\frac{4}{3}, -\\frac{1}{3})$[cite: 51].",
    choices: [
      "$c = -5$",
      "$c = \\frac{17}{3}$",
      "$c = 5$",
      "$c = 3$"
    ],
    correctIndex: 2,
    difficulty: 2,
    tags: ["functions2", "quadratics", "paper1"]
  }
];

// Add a batch here, then upload it from GM Dashboard > Questions.
export const generatedQuestions: GeneratedQuestion[] = [];
