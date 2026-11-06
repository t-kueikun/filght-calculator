import type { Aircraft, Config } from "./types";

export type V3 = [number, number, number]; // span, up, aft from main wing LE
export type FoilPoint = {
  x: number;
  upper: [number, number];
  lower: [number, number];
  camber: number;
};
export type Face = {
  points: V3[];
  part: "wing" | "tail" | "elevator" | "body" | "prop";
  upper?: boolean;
};
const rad = (v: number) => (v * Math.PI) / 180;

export function normalizeConfig(c: Config): Config {
  return {
    ...c,
    aircraft: Object.assign(
      {
        airfoil_mode: "manual" as const,
        camber: 0.02,
        camber_position: 0.4,
        thickness: 0.12,
      },
      c.aircraft,
    ),
  };
}

/** Closed-TE NACA four-digit geometry, cosine spacing; all coordinates / chord. */
export function nacaSection(
  m: number,
  p: number,
  t: number,
  points = 65,
): FoilPoint[] {
  return Array.from({ length: points }, (_, i) => {
    const x = (1 - Math.cos((Math.PI * i) / (points - 1))) / 2;
    const front = x < p,
      den = front ? p * p : (1 - p) ** 2;
    const camber =
      m === 0
        ? 0
        : (m / den) *
          (front ? 2 * p * x - x * x : 1 - 2 * p + 2 * p * x - x * x);
    const slope = m === 0 ? 0 : ((2 * m) / den) * (p - x),
      angle = Math.atan(slope);
    const thick =
      5 *
      t *
      (0.2969 * Math.sqrt(x) -
        0.126 * x -
        0.3516 * x * x +
        0.2843 * x ** 3 -
        0.1036 * x ** 4);
    return {
      x,
      camber,
      upper: [x - thick * Math.sin(angle), camber + thick * Math.cos(angle)],
      lower: [x + thick * Math.sin(angle), camber - thick * Math.cos(angle)],
    };
  });
}

/** Same exact camber integrals as aeroflight.airfoil, independent of foil thickness. */
export function thinAirfoil(m: number, p: number) {
  if (m === 0) return { zeroLift: 0, cm0: 0 };
  const b = Math.acos(1 - 2 * p),
    a = 2 * p - 1;
  const f = (v: number) =>
    (a - 0.5) * v + (1 - a) * Math.sin(v) - 0.25 * Math.sin(2 * v);
  const g = (v: number) =>
    a * (0.5 * Math.sin(2 * v) - Math.sin(v)) +
    Math.sin(3 * v) / 6 +
    0.5 * Math.sin(v) -
    0.5 * v -
    0.25 * Math.sin(2 * v);
  const integrate = (fn: (v: number) => number) =>
    (m / p ** 2) * (fn(b) - fn(0)) + (m / (1 - p) ** 2) * (fn(Math.PI) - fn(b));
  return {
    zeroLift: ((integrate(f) / Math.PI) * 180) / Math.PI,
    cm0: 0.5 * integrate(g),
  };
}

export function geometry(a: Aircraft) {
  const area = (a.span * a.root_chord * (1 + a.taper)) / 2;
  const mac =
    (((2 * a.root_chord) / 3) * (1 + a.taper + a.taper * a.taper)) /
    (1 + a.taper);
  let mass = a.mass,
    cg = a.cg_mac * mac,
    cgZ = 0,
    iyy = a.iyy;
  if (a.mass_mode === "components" && a.components.length) {
    mass = a.components.reduce((s, c) => s + c.mass, 0);
    cg = a.components.reduce((s, c) => s + c.mass * c.x, 0) / mass;
    cgZ = a.components.reduce((s, c) => s + c.mass * c.z, 0) / mass;
    iyy = a.components.reduce(
      (s, c) => s + c.iyy + c.mass * ((c.x - cg) ** 2 + (c.z - cgZ) ** 2),
      0,
    );
  }
  const tailAC = 0.25 * mac + a.tail_arm,
    tailChord = a.tail_area / a.tail_span;
  const tailLE = tailAC - 0.25 * tailChord;
  const slope = (ar: number) => (2 * Math.PI) / (1 + 2 / (a.oswald * ar));
  const aw = slope((a.span * a.span) / area);
  const kt =
    a.tail_efficiency *
    a.tail_area *
    slope((a.tail_span * a.tail_span) / a.tail_area) *
    (1 - (2 * aw) / ((Math.PI * a.span * a.span) / area));
  const neutral = 0.25 * mac + (a.tail_arm * kt) / (area * aw + kt);
  return {
    area,
    mac,
    ar: (a.span * a.span) / area,
    mass,
    cg,
    cgZ,
    iyy,
    tailAC,
    tailChord,
    tailLE,
    neutral,
    tipChord: a.root_chord * a.taper,
    macSpan: ((a.span / 6) * (1 + 2 * a.taper)) / (1 + a.taper),
    effective:
      a.airfoil_mode === "naca4"
        ? thinAirfoil(a.camber, a.camber_position)
        : { zeroLift: a.zero_lift, cm0: a.cm0 },
  };
}

export function foilName(a: Aircraft) {
  if (a.airfoil_mode !== "naca4") return "翼型未指定";
  const digits = [a.camber * 100, a.camber_position * 10, a.thickness * 100];
  if (digits.every((v) => Math.abs(v - Math.round(v)) < 1e-6))
    return `NACA ${Math.round(digits[0])}${a.camber === 0 ? 0 : Math.round(digits[1])}${String(Math.round(digits[2])).padStart(2, "0")}`;
  return "NACA 4桁式・カスタム";
}

export function mainSection(a: Aircraft, points = 65) {
  // Legacy manual-coefficient designs do not define a physical airfoil.
  return a.airfoil_mode === "naca4"
    ? nacaSection(a.camber, a.camber_position, a.thickness, points)
    : nacaSection(0, 0.4, 0.018, points);
}

export function surfacePoint(
  point: [number, number],
  span: number,
  chord: number,
  leading: number,
  incidence: number,
  elevator = 0,
): V3 {
  let x = point[0] * chord,
    y = point[1] * chord;
  if (elevator && x > 0.7 * chord) {
    const dx = x - 0.7 * chord,
      ang = rad(elevator);
    x = 0.7 * chord + dx * Math.cos(ang) + y * Math.sin(ang);
    y = -dx * Math.sin(ang) + y * Math.cos(ang);
  }
  const ac = 0.25 * chord,
    angle = rad(incidence);
  return [
    span,
    y * Math.cos(angle) - (x - ac) * Math.sin(angle),
    leading + ac + (x - ac) * Math.cos(angle) + y * Math.sin(angle),
  ];
}

export function aircraftMesh(a: Aircraft): Face[] {
  const g = geometry(a),
    faces: Face[] = [];
  function surface(
    foil: FoilPoint[],
    span: number,
    root: number,
    taper: number,
    leading: number,
    incidence: number,
    tail = false,
  ) {
    const stations = 9;
    for (let i = 0; i < stations - 1; i++) {
      const left = -span / 2 + (span * i) / (stations - 1),
        right = -span / 2 + (span * (i + 1)) / (stations - 1);
      const at = (p: FoilPoint, s: number, upper: boolean) =>
        surfacePoint(
          upper ? p.upper : p.lower,
          s,
          root * (1 - (1 - taper) * Math.abs((2 * s) / span)),
          leading,
          incidence,
          tail ? a.elevator : 0,
        );
      for (let j = 0; j < foil.length - 1; j++)
        for (const upper of [true, false]) {
          const pts = [
            at(foil[j], left, upper),
            at(foil[j + 1], left, upper),
            at(foil[j + 1], right, upper),
            at(foil[j], right, upper),
          ];
          faces.push({
            points: upper ? pts : pts.slice().reverse(),
            part: tail ? (foil[j].x >= 0.7 ? "elevator" : "tail") : "wing",
            upper,
          });
        }
    }
    for (const tip of [-span / 2, span / 2]) {
      const chord = root * taper;
      for (let j = 0; j < foil.length - 1; j++)
        faces.push({
          part: tail ? "tail" : "wing",
          points: [
            foil[j].upper,
            foil[j + 1].upper,
            foil[j + 1].lower,
            foil[j].lower,
          ].map((p) =>
            surfacePoint(
              p as [number, number],
              tip,
              chord,
              leading,
              incidence,
              tail ? a.elevator : 0,
            ),
          ),
        });
    }
  }
  surface(mainSection(a, 33), a.span, a.root_chord, a.taper, 0, a.incidence);
  surface(
    nacaSection(0, 0.4, 0.1, 25),
    a.tail_span,
    g.tailChord,
    1,
    g.tailLE,
    a.tail_incidence,
    true,
  );
  // A slender reference boom; its dimensions are not an aerodynamic fuselage model.
  const width = Math.min(0.025, a.root_chord * 0.1),
    nose = -0.8 * a.root_chord,
    end = g.tailLE + g.tailChord;
  const corners: V3[] = [
    [-width, -width, nose],
    [width, -width, nose],
    [width, width, nose],
    [-width, width, nose],
    [-width, -width, end],
    [width, -width, end],
    [width, width, end],
    [-width, width, end],
  ];
  for (const indices of [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [2, 6, 7, 3],
    [3, 7, 4, 0],
  ])
    faces.push({ part: "body", points: indices.map((i) => corners[i]) });
  if (a.kind === "powered") {
    const radius = Math.min(0.12, a.span * 0.1),
      z = nose - 0.025;
    faces.push({
      part: "prop",
      points: [
        [-radius, -0.008, z],
        [radius, -0.008, z],
        [radius, 0.008, z],
        [-radius, 0.008, z],
      ],
    });
    faces.push({
      part: "prop",
      points: [
        [-0.008, -radius, z],
        [0.008, -radius, z],
        [0.008, radius, z],
        [-0.008, radius, z],
      ],
    });
  }
  return faces;
}

export function datFile(a: Aircraft) {
  const foil = mainSection(a, 101);
  const points = [
    ...foil.map((p) => p.upper).reverse(),
    ...foil.slice(1).map((p) => p.lower),
  ];
  return (
    `${foilName(a)} | closed TE | x/c y/c\n` +
    points.map((p) => p.map((v) => v.toFixed(8)).join(" ")).join("\n") +
    "\n"
  );
}
