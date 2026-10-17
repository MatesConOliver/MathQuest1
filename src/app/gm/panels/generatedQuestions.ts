export type GeneratedQuestion = {
  title: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  difficulty: number;
  tags: string[];
};

// Add a batch here, then upload it from GM Dashboard > Questions.
export const generatedQuestions: GeneratedQuestion[] = [
  {
    title: "Functions 4.1: Improper Rational Function Partial Fractions",
    prompt: "Express the improper rational function $f(x) = \\frac{x^3 + 2x^2 - 4x + 3}{x^2 - 1}$ in partial fractions.",
    choices: [
      "$x + 2 + \\frac{1}{x - 1} - \\frac{4}{x + 1}$",
      "$x + 2 - \\frac{1}{x - 1} + \\frac{4}{x + 1}$",
      "$x - 2 + \\frac{4}{x - 1} - \\frac{1}{x + 1}$",
      "$x + 2 + \\frac{3}{x - 1} - \\frac{5}{x + 1}$"
    ],
    correctIndex: 0,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.2: Polynomial System from Factor and Remainder",
    prompt: "The polynomial $P(x) = 2x^3 + ax^2 + bx - 6$ is divisible by $(x - 2)$ and leaves a remainder of $12$ when divided by $(x + 1)$. Find the values of $a$ and $b$.",
    choices: [
      "$a = -5, b = 15$",
      "$a = 5, b = -15$",
      "$a = 3, b = -11$",
      "$a = 5, b = 15$"
    ],
    correctIndex: 1,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.3: Discriminant Analysis with Parameter",
    prompt: "Find the set of values of $k$ for which the equation $(k - 2)x^2 + 4x + (k - 5) = 0$ has two distinct real roots.",
    choices: [
      "$1 < k < 6$",
      "$k < 1 \\text{ or } k > 6$",
      "$1 < k < 6, k \\neq 2$",
      "$k > 2$"
    ],
    correctIndex: 2,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.4: Oblique Asymptote of Rational Function",
    prompt: "Find the equation of the oblique asymptote of the rational function $f(x) = \\frac{2x^3 - 3x^2 + 5x - 4}{x^2 + 1}$.",
    choices: [
      "$y = 2x + 3$",
      "$y = 2x - 3$",
      "$y = 2x$",
      "$y = -3x + 5$"
    ],
    correctIndex: 1,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.5: Absolute Value Quadratic Inequality",
    prompt: "Find the complete solution set for the inequality $|x^2 - 4| < 3x$.",
    choices: [
      "$-1 < x < 4$",
      "$x < -1 \\text{ or } x > 4$",
      "$1 < x < 4$",
      "$0 < x < 4$"
    ],
    correctIndex: 2,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.6: Multiplicity of Zeros and Coefficient Sum",
    prompt: "The polynomial $P(x) = x^4 - 6x^3 + 13x^2 + ax + b$ has a zero at $x = 2$ of multiplicity $2$. Find the value of $a + b$.",
    choices: [
      "$-8$",
      "$8$",
      "$-16$",
      "$-4$"
    ],
    correctIndex: 0,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.7: Range of a Rational Function",
    prompt: "Find the range of the rational function $f(x) = \\frac{x^2 - x + 1}{x^2 + x + 1}$ for $x \\in \\mathbb{R}$.",
    choices: [
      "$f(x) \\ge 0$",
      "$\\frac{1}{3} \\le f(x) \\le 3$",
      "$-3 \\le f(x) \\le 3$",
      "$\\frac{1}{3} < f(x) < 3$"
    ],
    correctIndex: 1,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.8: Transformation of Function Vertex",
    prompt: "The graph of $y = f(x)$ has a vertex at $(4, -6)$. The graph is transformed to $g(x) = 2f\\left(\\frac{1}{3}x - 1\\right) + 5$. Find the coordinates of the corresponding vertex on the graph of $g(x)$.",
    choices: [
      "$(1, -7)$",
      "$(15, -12)$",
      "$(9, -7)$",
      "$(15, -7)$"
    ],
    correctIndex: 3,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.9: Decomposition with Irreducible Quadratic",
    prompt: "Decompose the rational function $\\frac{3x^2 - x + 8}{(x - 1)(x^2 + 4)}$ into partial fractions.",
    choices: [
      "$\\frac{2}{x - 1} + \\frac{x}{x^2 + 4}$",
      "$\\frac{2}{x - 1} + \\frac{1}{x^2 + 4}$",
      "$\\frac{3}{x - 1} - \\frac{x}{x^2 + 4}$",
      "$\\frac{1}{x - 1} + \\frac{2x}{x^2 + 4}$"
    ],
    correctIndex: 0,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.10: Sum of Squares of Cubic Roots",
    prompt: "The cubic equation $x^3 - 7x^2 + 14x - 8 = 0$ has roots $\\alpha, \\beta, \\gamma$. Find the value of $\\alpha^2 + \\beta^2 + \\gamma^2$.",
    choices: [
      "$21$",
      "$49$",
      "$35$",
      "$28$"
    ],
    correctIndex: 0,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.11: Double Absolute Value Inequality",
    prompt: "Find all real values of $x$ satisfying the inequality $|2x - 5| \\le |x + 1|$.",
    choices: [
      "$x \\le \\frac{4}{3} \\text{ or } x \\ge 6$",
      "$\\frac{4}{3} \\le x \\le 6$",
      "$-1 \\le x \\le \\frac{5}{2}$",
      "$\\frac{4}{3} < x < 6$"
    ],
    correctIndex: 1,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.12: Radical Equation Real Solutions",
    prompt: "Determine the number of real solutions to the equation $\\sqrt{x + 5} - \\sqrt{x - 3} = 2$.",
    choices: [
      "$0$",
      "$1$",
      "$2$",
      "Infinitely many"
    ],
    correctIndex: 1,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.13: Parameter Range for No Real Solutions",
    prompt: "Find the range of values of $m$ for which the equation $\\frac{x^2 - 2x + 4}{x + 2} = m$ has no real solutions.",
    choices: [
      "$-6 - 4\\sqrt{3} < m < -6 + 4\\sqrt{3}$",
      "$m < -6 - 4\\sqrt{3} \\text{ or } m > -6 + 4\\sqrt{3}$",
      "$-4\\sqrt{3} < m < 4\\sqrt{3}$",
      "$-12 < m < 12$"
    ],
    correctIndex: 0,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.14: Four-Critical-Point Rational Inequality",
    prompt: "Find the complete solution set for the inequality $\\frac{x^2 - 3x + 2}{x^2 - 9} \\le 0$.",
    choices: [
      "$-3 \\le x \\le 1 \\text{ or } 2 \\le x \\le 3$",
      "$-3 < x \\le 1 \\text{ or } 2 \\le x < 3$",
      "$1 \\le x \\le 2$",
      "$x < -3 \\text{ or } 1 \\le x \\le 2 \\text{ or } x > 3$"
    ],
    correctIndex: 1,
    difficulty: 4,
    tags: ["functions4"]
  },
  {
    title: "Functions 4.15: Transformation of Quadratic Roots",
    prompt: "If $\\alpha$ and $\\beta$ are the roots of $2x^2 - 4x + 1 = 0$, find a quadratic equation with integer coefficients whose roots are $\\alpha^2$ and $\\beta^2$.",
    choices: [
      "$4x^2 - 12x + 1 = 0$",
      "$4x^2 + 12x + 1 = 0$",
      "$2x^2 - 6x + 1 = 0$",
      "$x^2 - 3x + 4 = 0$"
    ],
    correctIndex: 0,
    difficulty: 4,
    tags: ["functions4"]
  }
];
