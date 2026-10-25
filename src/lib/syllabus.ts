export interface SyllabusTopic {
  number: number;
  title: string;
  subtopics: string[];
}

export const IB_MATH_AA_HL_SYLLABUS: SyllabusTopic[] = [
  {
    number: 1,
    title: "Algebra and functions basics",
    subtopics: [
      "Different forms of equations of lines and their gradients and intercepts",
      "Parallel and perpendicular lines",
      "Different methods to solve a system of linear equations (maximum of three equations in three unknowns)",
      "The concept of a function and its domain, range and graph",
      "Mathematical notation for functions",
      "Composite functions",
      "Characteristics of an inverse function and finding the inverse function f⁻¹(x), self-inverse functions",
      "Transformations of graphs and composite transformations of graphs, |f(x)| and 1/f(x)",
    ],
  },
  {
    number: 2,
    title: "Functions",
    subtopics: [
      "Polynomial functions and their graphs",
      "Zeros and factors of polynomial functions; roots of polynomial equations",
      "Applying the factor and remainder theorems",
      "The sum and product of the roots of a polynomial equation (relations between coefficients and roots: for ax² + bx + c = 0, sum of roots = -b/a, product of roots = c/a, and relationships for higher-degree polynomials; apply these properties directly without using the name 'Vieta')",
      "Quadratic functions, and different forms in which to express them",
      "Finding characteristics of a parabola: axis of symmetry, x-intercepts and vertex",
      "Solving quadratic equations and inequalities",
      "Applying the quadratic formula and the discriminant of a quadratic equation",
      "Rational functions and their graphs, and identifying all asymptotes",
      "Solving a variety of equations and inequalities, both graphically and analytically",
      "Partial fractions",
    ],
  },
  {
    number: 3,
    title: "Sequences and series",
    subtopics: [
      "Working with arithmetic and geometric sequences",
      "Finding the sum of finite arithmetic and geometric sequences, and finding the sum of infinite geometric series",
      "Using sigma notation",
      "Using the binomial theorem for the expansion of (a + b)ⁿ, n ∈ N",
      "Working with counting principles, including permutations and combinations",
    ],
  },
  {
    number: 4,
    title: "Exponential and logarithmic functions",
    subtopics: [
      "Exponential functions and their graphs",
      "Concepts of exponential growth and decay, and applications",
      "The nature and significance of the number e",
      "Logarithmic functions and their graphs",
      "Properties of logarithms",
      "Solving equations involving exponential expressions",
      "Solving equations involving logarithmic expressions",
    ],
  },
  {
    number: 5,
    title: "Proofs",
    subtopics: [
      "The skills essential to read and practise abstract mathematical concepts",
      "Logic basics for proofs: statements, negations of statements, compound statements",
      "Proof procedures: direct proofs, proofs with contrapositive, contradiction, or counterexamples",
      "Writing and understanding proof by mathematical induction",
    ],
  },
  {
    number: 6,
    title: "Trigonometric functions and equations",
    subtopics: [
      "Angles measured in radians",
      "Computing the length of an arc and the area of a sector",
      "The unit circle and definitions for sin θ, cos θ, and tan θ",
      "Knowing exact values of sin, cos, and tan of π/6, π/4, π/3, π/2 and multiples",
      "The Pythagorean identities and double angle identities for sine and cosine",
      "The relationships between sin θ, cos θ, and tan θ",
      "The graphs of sin θ, cos θ, and tan θ (amplitude and period)",
      "Composite functions of the form a sin(b(x + c)) + d and a cos(b(x + c)) + d",
      "Applying trigonometry to real-life problems",
      "Solving trigonometric equations in a finite interval",
      "Reciprocal trigonometric ratios: sec θ, csc θ, cot θ",
      "Pythagorean identities involving tan, sec, csc, and cot",
      "Inverse functions arcsin x, arccos x, arctan x and their domains, ranges, graphs",
      "Compound angle identities for sin and cos; double angle identity for tan θ",
      "Relationships between trigonometric functions and graph symmetry",
    ],
  },
  {
    number: 7,
    title: "Geometry and trigonometry (3D & Vectors preview)",
    subtopics: [
      "Finding the distance between two points in 3-dimensional space",
      "Finding the midpoint of a line segment in 3-dimensional space",
      "Computing the volume and surface area of solids (pyramid, cone, sphere, hemisphere, composites)",
      "Determining the size of an angle between two lines",
      "Finding sides and angles of right-angled triangles using sine, cosine, tangent",
      "Applying the sine rule and cosine rule for unknown lengths or angles",
      "Computing triangle area using 1/2 a b sin C",
      "Solving 2D or 3D problems using right-angled and non-right-angled trigonometry",
      "Compass bearings and navigational geometry",
    ],
  },
  {
    number: 8,
    title: "Complex numbers",
    subtopics: [
      "Cartesian form z = a + bi, real and imaginary parts, complex conjugate, modulus and argument",
      "Arithmetic operations on complex numbers",
      "The complex plane (Argand diagram)",
      "Polar form r(cos θ + i sin θ) and Euler form r e^(iθ)",
      "De Moivre's theorem and applications",
      "Powers and roots of complex numbers; solving polynomial equations over C",
    ],
  },
  {
    number: 9,
    title: "Vectors, lines and planes (3D space)",
    subtopics: [
      "Representation of vectors in 2D and 3D, magnitude, unit vectors",
      "Scalar product (dot product), angle between two vectors, perpendicular and parallel vectors",
      "Vector product (cross product) and applications (area of triangle/parallelogram)",
      "Vector equation and parametric/Cartesian equations of a line in 2D and 3D",
      "Coincidence, parallel, intersecting, and skew lines",
      "Vector and Cartesian equations of planes in 3D",
      "Intersections between lines and planes; angle between planes or line and plane",
    ],
  },
  {
    number: 10,
    title: "Statistics",
    subtopics: [
      "Univariate data: measures of central tendency (mean, median, mode) and dispersion (range, IQR, variance, standard deviation)",
      "Frequency distributions, histograms, cumulative frequency graphs, box-and-whisker plots",
      "Bivariate data: scatter diagrams, Pearson's product-moment correlation coefficient r",
      "Linear regression of y on x and x on y, line of best fit, reliability (interpolation vs extrapolation)",
    ],
  },
  {
    number: 11,
    title: "Probability",
    subtopics: [
      "Concepts of trial, outcome, sample space, event",
      "Theoretical and experimental probability",
      "Venn diagrams, tree diagrams, sample space diagrams",
      "Mutually exclusive and independent events",
      "Conditional probability P(A|B) = P(A ∩ B) / P(B)",
      "Bayes' theorem and law of total probability",
    ],
  },
  {
    number: 12,
    title: "Differential calculus I",
    subtopics: [
      "The concept of a limit",
      "The derivative as a gradient (slope) function and as a rate of change",
      "Finding the derivative of a function from first principles (limit definition)",
      "Finding the derivative of polynomial functions (power rule)",
      "The derivatives of sin x and cos x",
      "Relationship between the graph of a function, its first derivative, and second derivative",
      "Identifying where a function is increasing or decreasing",
      "Finding and testing for maximum, minimum, and inflection points (first & second derivative tests)",
      "Kinematic problems involving displacement, velocity, and acceleration",
      "Finding the equation of a tangent or a normal at a given point",
    ],
  },
  {
    number: 13,
    title: "Differential calculus II",
    subtopics: [
      "Derivative of composite functions (chain rule)",
      "Derivative of product and quotient of functions (product rule & quotient rule)",
      "Derivative of trigonometric and inverse trigonometric functions",
      "Derivative of exponential and logarithmic functions",
      "Implicit differentiation (rates of change of implicitly defined variables)",
      "Related rates of change",
      "Optimisation problems (finding maximum or minimum in contextual applications)",
      "Using l'Hôpital's rule to evaluate limits in indeterminate form (0/0 or ∞/∞)",
    ],
  },
  {
    number: 14,
    title: "Integral calculus I",
    subtopics: [
      "Integration as antidifferentiation of functions",
      "Calculating and applying definite integrals",
      "Finding areas under curves (between curve and x-axis), and areas between curves",
      "Antidifferentiation with a boundary condition (initial value problems)",
      "Solving kinematic problems involving displacement s, velocity v, acceleration a, and total distance",
      "Integration of polynomial functions, trigonometric functions, inverses, and exponential functions",
      "Integration by inspection (reverse chain rule), partial fractions, substitution, and parts",
      "Volumes of revolution about the x-axis or y-axis",
    ],
  },
  {
    number: 15,
    title: "Probability distributions",
    subtopics: [
      "Discrete random variables and probability distributions, expected value E(X) and variance Var(X)",
      "Binomial distribution B(n, p), mean and variance",
      "Poisson distribution Po(m)",
      "Continuous random variables, probability density functions (PDF) and cumulative distribution functions (CDF)",
      "The normal distribution N(μ, σ²), standard normal Z, probability calculations and inverse normal",
    ],
  },
  {
    number: 16,
    title: "Integral calculus II",
    subtopics: [
      "First order differential equations: Euler's numerical method",
      "Variables separable differential equations",
      "Homogeneous differential equations",
      "Linear differential equations with integrating factor",
      "Maclaurin series expansions for eˣ, sin x, cos x, ln(1 + x), and (1 + x)ⁿ",
      "Simple substitution, products, integration, and differentiation to obtain series",
      "Maclaurin series developed from differential equations",
    ],
  },
];

/**
 * Returns a prompt snippet scoping the mathematical explanation strictly to the topics
 * available at the student's current location order (1 to X).
 */
export function getCurriculumConstraintPrompt(locationOrder?: number | null): string {
  if (!locationOrder || typeof locationOrder !== "number" || locationOrder <= 0) {
    return `
CURRICULUM CONTEXT:
The student is studying the complete IB DP Mathematics Analysis & Approaches Higher Level (Math AA HL) syllabus (Topics 1 through 16).
You may use standard high-school and IB DP Math AA HL methods with rigorous step-by-step derivations.
`.trim();
  }

  // Cap at 16 (the highest topic)
  const maxTopic = Math.min(Math.max(1, Math.round(locationOrder)), 16);

  const allowedTopics = IB_MATH_AA_HL_SYLLABUS.slice(0, maxTopic);
  const forbiddenTopics = IB_MATH_AA_HL_SYLLABUS.slice(maxTopic);

  const allowedSummary = allowedTopics
    .map((t) => `  • Topic ${t.number}: ${t.title} (${t.subtopics.slice(0, 3).join("; ")}...)`)
    .join("\n");

  const forbiddenSummary =
    forbiddenTopics.length > 0
      ? forbiddenTopics.map((t) => `  • Topic ${t.number}: ${t.title}`).join("\n")
      : "None (all 16 topics unlocked)";

  return `
CURRICULUM CONSTRAINT (STRICT LOCATION SCOPE):
The student is currently at Location ${maxTopic} in the adventure.
In this curriculum progression, the student ONLY knows and has studied Topics 1 through ${maxTopic} of the IB DP Mathematics Analysis & Approaches Higher Level (Math AA HL) syllabus:
${allowedSummary}

STRICT RESTRICTION:
The student HAS NOT YET LEARNED Topics ${maxTopic + 1} through 16:
${forbiddenSummary}

RULES FOR YOUR EXPLANATION:
1. You MUST solve and explain this problem using ONLY mathematical concepts, theorems, algebraic methods, and tools taught up to Topic ${maxTopic}.
${
  maxTopic < 12
    ? "2. DO NOT use calculus (no limits, no derivatives, no integrals, no gradient functions, no l'Hôpital's rule). For instance, find quadratic vertices or extrema via completing the square or symmetry, NOT by setting derivative to 0."
    : ""
}
${
  maxTopic < 13
    ? "3. DO NOT use advanced differential calculus (no chain rule, product rule, quotient rule, implicit differentiation, related rates, or derivative optimization)."
    : ""
}
${
  maxTopic < 14
    ? "4. DO NOT use integral calculus (no antiderivatives, areas under curves, or integration by parts)."
    : ""
}
${
  maxTopic < 4
    ? "5. DO NOT use logarithms or the number e. Stick purely to polynomial and algebraic techniques."
    : ""
}
${
  maxTopic < 3
    ? "6. DO NOT use sequences/series formulas, sigma notation, or the binomial theorem."
    : ""
}
${
  maxTopic < 8
    ? "7. DO NOT use complex numbers or imaginary unit i unless the problem itself introduces it."
    : ""
}
${
  maxTopic >= 2
    ? "8. TOPIC 2 SUM & PRODUCT OF ROOTS: In Topic 2, students work with the properties of the sum and product of the roots of a polynomial equation (for ax² + bx + c = 0, sum of roots = -b/a, product of roots = c/a, and extensions to higher-degree polynomials). You are strongly encouraged to use these sum and product of roots relationships whenever helpful, but DO NOT use the name 'Vieta' or 'Vieta's formulas'—students learn and apply these as standard properties of roots without knowing that name."
    : ""
}
9. If the problem naturally invites a higher-level tool (e.g., calculus), but can be solved with earlier tools (e.g., algebra, coordinate geometry, factoring, completing the square), YOU MUST USE THE LOWER-LEVEL TOOL so the student understands it at their current level.
`.trim();
}
