export type Aircraft = {
  name: string;
  kind: "glider" | "powered";
  mass: number;
  cg_mac: number;
  iyy: number;
  mass_mode: "manual" | "components";
  components: {
    name: string;
    mass: number;
    x: number;
    z: number;
    iyy: number;
  }[];
  span: number;
  root_chord: number;
  taper: number;
  airfoil_mode: "manual" | "naca4";
  camber: number;
  camber_position: number;
  thickness: number;
  incidence: number;
  tail_area: number;
  tail_span: number;
  tail_arm: number;
  tail_incidence: number;
  elevator: number;
  tail_efficiency: number;
  zero_lift: number;
  cm0: number;
  cd0: number;
  body_cda: number;
  oswald: number;
  cl_max: number;
  thrust_mode: "fixed" | "curve";
  thrust: number;
  throttle: number;
  thrust_curve: number[][];
  thrust_z: number;
  thrust_angle: number;
};
export type Conditions = {
  speed: number;
  height: number;
  launch_angle: number;
  pitch: number;
  pitch_rate: number;
  wind: number;
  density: number;
  temperature: number;
};
export type Solver = {
  duration: number;
  sample_dt: number;
  max_step: number;
  rtol: number;
  atol: number;
};
export type Config = {
  aircraft: Aircraft;
  conditions: Conditions;
  solver: Solver;
};
export type Row = Record<string, number>;
export type Result = {
  rows: Row[];
  status: "ground" | "duration" | "envelope";
  landing: null | { time: number; distance: number; speed: number };
  summary: Record<string, number>;
  warnings: string[];
  provenance: {
    model: string;
    source: string;
    aircraft: Aircraft;
    conditions: Conditions;
    solver: Solver;
    units: string;
    stability: string;
    airfoil?: {
      mode: string;
      zero_lift: number;
      cm0: number;
      theory: string;
      thickness_aero_effect: boolean;
      viscous_data: boolean;
    };
  };
};
export type Saved = {
  id: string;
  name: string;
  config: Config;
  result: Result;
  color: string;
};
