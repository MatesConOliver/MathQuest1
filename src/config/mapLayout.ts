export type MapLocationMeta = {
  locationId: string; // must match GameLocation.id
  x: number; // 0–1, relative horizontal position
  y: number; // 0–1, relative vertical position
  radius?: number; // optional click radius (in % or relative units)
  initiallyHidden?: boolean; // for story-gated locations (fogged at start)
  fogType?: "clouds" | "mist";
};

export const MAP_LOCATIONS: MapLocationMeta[] = [
  {
    locationId: "bSL1XkrzgqQxqtCLNumD", //library
    x: 0.51,
    y: 0.51,
    initiallyHidden: false,
    fogType: "mist",
  },
  {
    locationId: "NNaAatxu2L25wWhKHc6Z", //algebra
    x: 0.23,
    y: 0.45,
    initiallyHidden: true,
    fogType: "clouds",
  },
  {
    locationId: "RRpoA4VdN9MgJaiscA0b", //functions
    x: 0.85,
    y: 0.3,
    initiallyHidden: true,
    fogType: "clouds",
  },
  {
    locationId: "2qsVAsgI3VhpfZ091h1c", //geometry
    x: 0.6,
    y: 0.5,
    initiallyHidden: true,
    fogType: "clouds",
  },
  {
    locationId: "MYknm1xkQq7kWF2UTcNJ", //prob and statistics
    x: 0.2,
    y: 0.8,
    initiallyHidden: true,
    fogType: "clouds",
  },
  {
    locationId: "Y78ufmYJvaCc0ZPE1UfW", //calculus
    x: 0.7,
    y: 0.1,
    initiallyHidden: true,
    fogType: "clouds",
  },
];
