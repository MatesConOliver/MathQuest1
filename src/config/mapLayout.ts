export type MapLocationMeta = {
  locationId: string; // must match GameLocation.id
  x: number; // 0–1, relative horizontal position
  y: number; // 0–1, relative vertical position
  radius?: number; // optional click radius (in % or relative units)
  initiallyHidden?: boolean; // for story-gated locations (fogged at start)
  fogType?: "clouds" | "mist";
  emoji?: string;
};

export const MAP_LOCATIONS: MapLocationMeta[] = [
  {
    locationId: "bSL1XkrzgqQxqtCLNumD", //1-library
    x: 0.51,
    y: 0.5,
    initiallyHidden: false,
    fogType: "mist",
    emoji: "📚",
  },
  {
    locationId: "RRpoA4VdN9MgJaiscA0b", //2-functions - polynomial ridge
    x: 0.85,
    y: 0.3,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "⛰️⛰️",
  },
  {
    locationId: "NNaAatxu2L25wWhKHc6Z", //3-sequences and series - Fibonacci forest
    x: 0.23,
    y: 0.5,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🌲",
  },
  {
    locationId: "Sacred_grove", //4-Sacred Grove of the Natural Log
    x: 0.77,
    y: 0.76,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🪵",
  },
  {
    locationId: "Hamelin", //5-Hamelin
    x: 0.55,
    y: 0.28,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🪈",
  },
  {
    locationId: "sine_wave_bay", //6-Sine Wave Bay
    x: 0.04,
    y: 0.42,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🌊",
  },
  {
    locationId: "2qsVAsgI3VhpfZ091h1c", //7-geometry megalopolis
    x: 0.615,
    y: 0.44,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🏙️",
  },
  {
    locationId: "mirage_islands", //8-Mirage islands
    x: 0.339,
    y: 0.21,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🪽",
  },
  {
    locationId: "atlantis", //9-Atlantis
    x: 0.65,
    y: 0.85,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🧜🏼🪸",
  },
  {
    locationId: "mean_plains", //10-Mean Plains
    x: 0.82,
    y: 0.42,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🏜️",
  },
  {
    locationId: "MYknm1xkQq7kWF2UTcNJ", //11-probability caves
    x: 0.2,
    y: 0.85,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🎲🦇",
  },
  {
    locationId: "local_extrema_range", //12-Local extrema range
    x: 0.43,
    y: 0.33,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🌄",
  },
  {
    locationId: "limitless_abyss", //13-Limitless abyss
    x: 0.155,
    y: 0.149,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🕳️",
  },
  {
    locationId: "lava_hillside_volcano", //14-Lava Under the Hillside
    x: 0.94,
    y: 0.87,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🌋",
  },
  {
    locationId: "normal_archipelago", //15-Normal Archipelago
    x: 0.46,
    y: 0.84,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🏝️🏝️🏝️🏝️",
  },
  {
    locationId: "Y78ufmYJvaCc0ZPE1UfW", //16-calculus II - peak
    x: 0.68,
    y: 0.07,
    initiallyHidden: true,
    fogType: "clouds",
    emoji: "🏔️",
  },
];
