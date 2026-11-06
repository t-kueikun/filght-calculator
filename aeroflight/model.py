from dataclasses import dataclass, field, asdict
import math
from .airfoil import thin_airfoil


def bounded(name, value, lo, hi):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lo <= value <= hi:
        raise ValueError(f"{name}: {lo} ～ {hi} の有限値を指定してください")


@dataclass
class Component:
    name: str = "部品"
    mass: float = 0.1
    x: float = 0.05  # station aft of wing leading edge, m
    z: float = 0.0  # down, m
    iyy: float = 0.0001  # intrinsic moment about component CG

    def __post_init__(self):
        bounded("部品質量", self.mass, 0.00001, 20)
        for key in ("x", "z"):
            bounded(key, getattr(self, key), -5, 5)
        bounded("部品Iyy", self.iyy, 0, 10)
        if not isinstance(self.name, str) or len(self.name) > 100:
            raise ValueError("部品名が不正です")


def mass_properties(components):
    if not components:
        raise ValueError("部品を1個以上指定してください")
    mass = sum(c.mass for c in components)
    x = sum(c.mass * c.x for c in components) / mass
    z = sum(c.mass * c.z for c in components) / mass
    inertia = sum(c.iyy + c.mass * ((c.x - x)**2 + (c.z - z)**2) for c in components)
    return mass, x, z, inertia


@dataclass
class Aircraft:
    name: str = "GL-01 手投げグライダー"
    kind: str = "glider"
    mass: float = 0.32
    cg_mac: float = 0.30
    iyy: float = 0.008
    mass_mode: str = "manual"
    components: list[Component] = field(default_factory=list)
    span: float = 1.0
    root_chord: float = 0.18
    taper: float = 1.0
    airfoil_mode: str = "manual"  # old JSON uses manual coefficients unchanged
    camber: float = .02
    camber_position: float = .4
    thickness: float = .12  # geometry only; inviscid theory has no thickness drag
    incidence: float = 2.0  # degrees on input; engine converts explicitly
    tail_area: float = 0.035
    tail_span: float = 0.4
    tail_arm: float = 0.42
    tail_incidence: float = -0.8
    elevator: float = 0.0  # positive trailing edge down
    tail_efficiency: float = 0.9
    zero_lift: float = -2.0  # engineering approximation, not NACA analysis
    cm0: float = -0.04
    cd0: float = 0.025
    body_cda: float = 0.002
    oswald: float = 0.8
    cl_max: float = 1.15
    thrust_mode: str = "curve"
    thrust: float = 3.0
    throttle: float = 0.65
    thrust_curve: list[list[float]] = field(default_factory=lambda: [[0, 4.0], [10, 2.8], [20, 0.8], [30, 0]])
    thrust_z: float = 0.0  # relative to CG; down positive
    thrust_angle: float = 0.0  # up positive, degrees

    def __post_init__(self):
        if not isinstance(self.name, str) or not 1 <= len(self.name) <= 100:
            raise ValueError("機体名は1～100文字です")
        if self.kind not in ("glider", "powered") or self.mass_mode not in ("manual", "components"):
            raise ValueError("機体タイプまたは質量モードが不正です")
        if self.airfoil_mode not in ("manual", "naca4"):
            raise ValueError("翼型モデルが不正です")
        self.components = [Component(**c) if isinstance(c, dict) else c for c in self.components]
        if len(self.components) > 100:
            raise ValueError("部品は100個までです")
        ranges = {"mass": (.02, 20), "cg_mac": (-.5, 1.5), "iyy": (1e-5, 10), "span": (.1, 5),
                  "root_chord": (.03, 1), "taper": (.1, 1), "incidence": (-10, 15),
                  "camber": (0, .06), "camber_position": (.1, .8), "thickness": (.04, .24),
                  "tail_area": (.001, 1), "tail_span": (.05, 3), "tail_arm": (.05, 3),
                  "tail_incidence": (-15, 15), "elevator": (-25, 25), "tail_efficiency": (.1, 1),
                  "zero_lift": (-8, 5), "cm0": (-.3, .3), "cd0": (0, .2), "body_cda": (0, .1),
                  "oswald": (.3, 1), "cl_max": (.2, 2), "thrust": (0, 100), "throttle": (0, 1),
                  "thrust_z": (-1, 1), "thrust_angle": (-30, 30)}
        for key, limits in ranges.items():
            bounded(key, getattr(self, key), *limits)
        if self.ar < 2:
            raise ValueError("主翼アスペクト比は2以上にしてください（低AR翼は本モデルの対象外です）")
        if self.thrust_mode not in ("fixed", "curve"):
            raise ValueError("推力モデルが不正です")
        if not 2 <= len(self.thrust_curve) <= 100:
            raise ValueError("推力曲線は2～100点です")
        previous = -1
        for point in self.thrust_curve:
            if len(point) != 2:
                raise ValueError("推力曲線は [速度m/s, 推力N] です")
            v, t = point
            bounded("推力曲線速度", v, 0, 100)
            bounded("推力曲線推力", t, 0, 100)
            if v <= previous:
                raise ValueError("推力曲線速度は昇順・重複なしです")
            previous = v
        if self.mass_mode == "components":
            m, _, _, inertia = mass_properties(self.components)
            bounded("部品合計質量", m, .02, 20)
            bounded("部品合成Iyy", inertia, 1e-5, 10)

    @property
    def area(self):
        return self.span * self.root_chord * (1 + self.taper) / 2

    @property
    def mac(self):
        return 2 * self.root_chord / 3 * (1 + self.taper + self.taper**2) / (1 + self.taper)

    @property
    def ar(self):
        return self.span**2 / self.area

    @property
    def properties(self):
        # Unswept common leading edge for tapered wing.
        return mass_properties(self.components) if self.mass_mode == "components" else (self.mass, self.cg_mac * self.mac, 0., self.iyy)

    @property
    def airfoil_coefficients(self):
        """Zero-lift angle [rad], Cm at quarter MAC. No hidden parameter overrides."""
        if self.airfoil_mode == "naca4":
            return thin_airfoil(self.camber, self.camber_position)
        return math.radians(self.zero_lift), self.cm0

    def to_dict(self):
        return asdict(self)


@dataclass
class Conditions:
    speed: float = 9.0  # launch ground speed
    height: float = 1.8
    launch_angle: float = 3.0
    pitch: float = 3.0
    pitch_rate: float = 0.0
    wind: float = 0.0  # earth +x, tailwind positive
    density: float = 1.225
    temperature: float = 15.0

    def __post_init__(self):
        limits = {"speed": (.5, 50), "height": (.05, 500), "launch_angle": (-45, 60), "pitch": (-45, 60),
                  "pitch_rate": (-90, 90), "wind": (-20, 20), "density": (.3, 1.5), "temperature": (-30, 50)}
        for key, interval in limits.items():
            bounded(key, getattr(self, key), *interval)


@dataclass
class Solver:
    duration: float = 20.0
    sample_dt: float = .05
    max_step: float = .02
    rtol: float = 1e-7
    atol: float = 1e-9

    def __post_init__(self):
        for key, interval in {"duration": (.1, 120), "sample_dt": (.02, 1), "max_step": (.001, .1), "rtol": (1e-10, 1e-3), "atol": (1e-12, 1e-4)}.items():
            bounded(key, getattr(self, key), *interval)
        if self.duration / self.max_step > 40000:
            raise ValueError("計算ステップ数が多すぎます")
