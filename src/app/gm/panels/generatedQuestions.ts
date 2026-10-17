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
    title: "Functions 3.1: Discriminant with Parameter",
    prompt: "Find the set of values of $k$ for which the equation $kx^2 - 3x + (k + 2) = 0$ has two distinct real roots.",
    choices: [
      "$-3 < k < 1, k \\neq 0$",
      "$k < -3 \\text{ or } k > 1$",
      "$-1 < k < 3, k \\neq 0$",
      "$k < -1 \\text{ or } k > 3$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.2: Roots in Geometric Progression",
    prompt: "The zeros of the equation $x^3 - 6x^2 - 24x + 64 = 0$ are consecutive terms in a geometric sequence. Find the sum of the squares of these three zeros.",
    choices: [
      "$84$",
      "$116$",
      "$56$",
      "$98$"
    ],
    correctIndex: 1,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.3: Cubic Roots with Arithmetic Progression",
    prompt: "Find the value of $k$ such that the zeros of the equation $x^3 - 6x^2 + kx + 10 = 0$ are in an arithmetic progression.",
    choices: [
      "$k = 3$",
      "$k = -3$",
      "$k = -9$",
      "$k = 9$"
    ],
    correctIndex: 1,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.4: Equal Remainder Theorem",
    prompt: "The polynomial $f(x) = x^3 + 3x^2 + ax + b$ leaves the same remainder when divided by $(x - 2)$ as when divided by $(x + 1)$. Find the value of $a$.",
    choices: [
      "$a = -7$",
      "$a = 7$",
      "$a = -3$",
      "$a = 5$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.5: System of Polynomial Remainders",
    prompt: "The polynomial $6x^3 + 7x^2 + ax + b$ has a remainder of $72$ when divided by $(x - 2)$ and is exactly divisible by $(x + 1)$. Find the values of $a$ and $b$.",
    choices: [
      "$a = -16, b = -15$",
      "$a = 16, b = 15$",
      "$a = -16, b = 15$",
      "$a = 16, b = -15$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.6: Quadratic Inequality with Parameter",
    prompt: "Find the range of values of $k$ such that $3x^2 - 12x + k > 0$ for all real values of $x$.",
    choices: [
      "$k > 12$",
      "$k < 12$",
      "$k > 36$",
      "$k < 0$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.7: Absolute Value Equation",
    prompt: "Find all real solutions to the equation $|x - 1| + |x| = 3$.",
    choices: [
      "$x = -1 \\text{ or } x = 2$",
      "$x = 1 \\text{ or } x = -2$",
      "$x = 2 \\text{ only}$",
      "$x = -1 \\text{ only}$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.8: Equation with Square Roots",
    prompt: "Solve for $x$ in the equation $\\sqrt{2x + 3} - \\sqrt{x - 2} = 2$.",
    choices: [
      "$x = 3 \\text{ or } x = 27$",
      "$x = 3 \\text{ only}$",
      "$x = 27 \\text{ only}$",
      "$x = -1 \\text{ or } x = 3$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.9: Equation in Quadratic Form",
    prompt: "Find all real solutions to the equation $2x^{\\frac{2}{3}} - x^{\\frac{1}{3}} - 15 = 0$.",
    choices: [
      "$x = 27 \\text{ or } x = -\\frac{125}{8}$",
      "$x = 3 \\text{ or } x = -\\frac{5}{2}$",
      "$x = 27 \\text{ or } x = \\frac{125}{8}$",
      "$x = -27 \\text{ or } x = -\\frac{125}{8}$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.10: Fractional Equation with Extraneous Solutions",
    prompt: "Find all real solutions to the equation $\\frac{2x}{1 - x^2} + \\frac{1}{x + 1} = 2$.",
    choices: [
      "$x = -1 \\text{ or } x = \\frac{3}{2}$",
      "$x = \\frac{3}{2} \\text{ only}$",
      "$x = -1 \\text{ only}$",
      "$x = 1 \\text{ or } x = -\\frac{3}{2}$"
    ],
    correctIndex: 1,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.11: Absolute Value Inequality",
    prompt: "Find the set of values of $x$ satisfying the inequality $|x| < 5|x - 6|$.",
    choices: [
      "$x < 5 \\text{ or } x > 7.5$",
      "$5 < x < 7.5$",
      "$x < 5$",
      "$x < -7.5 \\text{ or } x > 5$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.12: Rational Inequality Analysis",
    prompt: "Find the complete solution set for the inequality $\\frac{x}{x - 2} > \\frac{1}{x + 1}$.",
    choices: [
      "$-1 < x < 2$",
      "$x < -1 \\text{ or } 2 < x$",
      "$x < -1 \\text{ or } -1 < x < 2 \\text{ or } x > 2$",
      "$x < -1 \\text{ or } 2 < x \\text{ (excluding } x = 1)$"
    ],
    correctIndex: 1,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.13: Double Zero of Quartic",
    prompt: "Given that $x = 2$ is a double root of the polynomial $x^4 - 5x^3 + 7x^2 - 4$, find the sum of the remaining two zeros.",
    choices: [
      "$1$",
      "$-1$",
      "$2$",
      "$0$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.14: Partial Fractions with Repeated Linear Factor",
    prompt: "Decompose $\\frac{3x + 4}{(x + 2)^2}$ into partial fractions.",
    choices: [
      "$\\frac{3}{x + 2} - \\frac{2}{(x + 2)^2}$",
      "$\\frac{3}{x + 2} + \\frac{2}{(x + 2)^2}$",
      "$\\frac{4}{x + 2} - \\frac{3}{(x + 2)^2}$",
      "$\\frac{3}{x + 2} + \\frac{4}{(x + 2)^2}$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.15: Partial Fractions with Irreducible Quadratic",
    prompt: "Find the partial fraction decomposition for $\\frac{2}{x^3 + x}$.",
    choices: [
      "$\\frac{2}{x} - \\frac{2x}{x^2 + 1}$",
      "$\\frac{2}{x} + \\frac{2x}{x^2 + 1}$",
      "$\\frac{1}{x} - \\frac{x}{x^2 + 1}$",
      "$\\frac{2}{x} - \\frac{2}{x^2 + 1}$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.16: Rational Function Transformations Form",
    prompt: "Express $f(x) = \\frac{2x^2 + 8x + 7}{x^2 + 4x + 5}$ in the form $a - \\frac{b}{(x + c)^2 + d}$.",
    choices: [
      "$2 - \\frac{1}{(x + 2)^2 + 1}$",
      "$2 - \\frac{3}{(x + 2)^2 + 1}$",
      "$1 - \\frac{2}{(x + 2)^2 + 1}$",
      "$2 + \\frac{1}{(x + 2)^2 + 1}$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.17: Rational Function Inequality",
    prompt: "Find the set of values of $x$ for which $\\frac{x + 4}{x + 1} \\le \\frac{x - 2}{x - 4}$.",
    choices: [
      "$-1 < x \\le \\frac{12}{11} \\text{ or } x > 4$",
      "$x < -1 \\text{ or } \\frac{12}{11} \\le x < 4$",
      "$-1 < x < 4$",
      "$x \\le \\frac{12}{11}, x \\neq -1$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.18: Absolute Value Rational Inequality",
    prompt: "Solve the inequality $\\left| \\frac{x + 9}{x - 9} \\right| \\le 2$.",
    choices: [
      "$x \\le 3 \\text{ or } x \\ge 27$",
      "$3 \\le x \\le 27 \\text{ and } x \\neq 9$",
      "$x \\le -27 \\text{ or } x \\ge -3$",
      "$-27 \\le x \\le 3$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.19: Quadratic Inequality for All Real x",
    prompt: "Find the range of values of $m$ such that the inequality $m(x + 1) \\le x^2$ is true for all real values of $x$.",
    choices: [
      "$-4 \\le m \\le 0$",
      "$0 \\le m \\le 4$",
      "$m \\le 0 \\text{ or } m \\ge 4$",
      "$m \\ge -4$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  },
  {
    title: "Functions 3.20: Polynomial Equation with Geometric Roots",
    prompt: "The roots of $x^3 - 19x^2 + bx - 216 = 0$ are consecutive terms in a geometric sequence. Find the value of $b$.",
    choices: [
      "$b = 114$",
      "$b = 57$",
      "$b = 133$",
      "$b = 76$"
    ],
    correctIndex: 0,
    difficulty: 3,
    tags: ["functions3"]
  }
];
