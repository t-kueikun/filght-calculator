import math
from dataclasses import asdict
import numpy as np
from scipy.integrate import solve_ivp
from .aero import forces, body_to_earth, earth_to_body, lift_slope, G
from .model import Solver


MODEL_VERSION = "3dof-naca-1.1"


def initial_state(c):
    gamma, theta = math.radians(c.launch_angle), math.radians(c.pitch)
    u, w = earth_to_body(c.speed * math.cos(gamma), c.speed * math.sin(gamma), theta)
    return np.array([0., c.height, u, w, theta, math.radians(c.pitch_rate)])


def derivatives(t, state, a, c):
    _, _, u, w, theta, q = state
    f = forces(state, a, c)
    m, _, _, inertia = a.properties
    dx, dh = body_to_earth(u, w, theta)
    return np.array([dx, dh, f["X"] / m - G * math.sin(theta) - q * w,
                     f["Z"] / m + G * math.cos(theta) + q * u, q, f["M"] / inertia])


def validity_margin(state, a, c):
    f = forces(state, a, c)
    return min(60 - abs(f["wing_alpha"]), 60 - abs(f["tail_alpha"]),
               180 - abs(math.degrees(state[5])), f["airspeed"] - .5, 80 - f["airspeed"])


def simulate(a, c, solver=None):
    s = solver or Solver()
    y0 = initial_state(c)
    if validity_margin(y0, a, c) <= 0:
        raise ValueError("初期状態がモデル有効範囲外です（対気速度・迎角を確認）")

    def ground(t, y):
        return y[1]

    def envelope(t, y):
        return validity_margin(y, a, c)

    ground.terminal = envelope.terminal = True
    ground.direction = envelope.direction = -1
    sol = solve_ivp(lambda t, y: derivatives(t, y, a, c), (0, s.duration), y0,
                    method="RK45", rtol=s.rtol, atol=s.atol, max_step=s.max_step,
                    dense_output=True, events=[ground, envelope])
    if not sol.success or not np.isfinite(sol.y).all():
        raise ValueError("数値積分に失敗しました。条件や刻み幅を見直してください")
    end = float(sol.t[-1])
    times = np.arange(0, end, s.sample_dt)
    times = np.append(times, end)
    states = sol.sol(times).T
    status = "ground" if len(sol.t_events[0]) else "envelope" if len(sol.t_events[1]) else "duration"
    rows = []
    warnings = ["工学的近似モデルです。実測・XFOILデータは未使用で、飛行距離の精度は未検証です。"]
    if a.airfoil_mode == "naca4":
        warnings.append("NACAのキャンバー線から薄翼理論で零揚力角とCmを推定。翼厚による粘性抗力・CLmaxの変化は未計算です。")
        if a.camber > .04 or a.thickness > .18:
            warnings.append("大きなキャンバー・厚い翼：薄翼理論の近似誤差が大きくなります。")
    if a.ar > 20:
        warnings.append("AR > 20：非常に細長い翼の構造変形を含まない剛体モデルです。")
    for t, state in zip(times, states):
        x, h, u, w, theta, q = state
        f = forces(state, a, c)
        row = dict(t=float(t), x=float(x), h=max(0., float(h)), u=float(u), w=float(w),
                   pitch=math.degrees(theta), pitch_rate=math.degrees(q), **f)
        rows.append(row)
    if min(r["reynolds"] for r in rows) < 100000:
        warnings.append("Re < 100,000：低レイノルズ数による剥離・抵抗増加を十分に再現しません。")
    if any(abs(r["cl"]) >= .95 * a.cl_max or abs(r["wing_alpha"]) > 12 or abs(r["tail_alpha"]) > 12 for r in rows):
        warnings.append("失速付近または大迎角に到達：以後の軌道は参考値です。失速後の流れは再現しません。")
    if any(abs(r["pitch_rate"]) > 60 for r in rows):
        warnings.append("強いピッチ運動：準定常空力モデルの誤差が大きくなります。")
    if status == "envelope":
        warnings.append("有効範囲を超えたため計算を終了しました。着地予測ではありません。")
    if a.kind == "powered" and a.thrust_mode == "fixed":
        warnings.append("固定推力の簡易モードです。速度依存性・電池消耗を含みません。")
    if a.kind == "powered" and a.thrust_mode == "curve" and any(r["airspeed"] < a.thrust_curve[0][0] or r["airspeed"] > a.thrust_curve[-1][0] for r in rows):
        warnings.append("推力曲線の速度範囲外では端点値に固定しています。")
    mass, cg, cg_z, inertia = a.properties
    aw = lift_slope(a.ar, a.oswald)
    at = lift_slope(a.tail_span**2 / a.tail_area, a.oswald)
    deps = 2 * aw / (math.pi * a.ar)
    tail_slope = a.tail_efficiency * a.tail_area * at * (1 - deps)
    neutral = .25 * a.mac + a.tail_arm * tail_slope / (a.area * aw + tail_slope)
    static_margin = (neutral - cg) / a.mac
    landing = {"time": end, "distance": rows[-1]["x"], "speed": rows[-1]["groundspeed"]} if status == "ground" else None
    zero_lift, cm0 = a.airfoil_coefficients
    return dict(rows=rows, status=status, landing=landing,
                summary=dict(distance=rows[-1]["x"], flight_time=end, max_height=max(r["h"] for r in rows),
                             max_speed=max(r["airspeed"] for r in rows), min_speed=min(r["airspeed"] for r in rows),
                             stall_speed=math.sqrt(2 * mass * G / (c.density * a.area * a.cl_max)),
                             static_margin=static_margin, neutral_mac=neutral / a.mac,
                             area=a.area, mac=a.mac, aspect_ratio=a.ar, mass=mass, cg_mac=cg/a.mac, cg_z=cg_z, iyy=inertia,
                             zero_lift=math.degrees(zero_lift), cm0=cm0),
                warnings=warnings,
                provenance=dict(model=MODEL_VERSION, source="engineering_approximation", aircraft=a.to_dict(),
                                conditions=asdict(c), solver=asdict(s), units="SI; angles in output: deg",
                                airfoil=dict(mode=a.airfoil_mode, zero_lift=math.degrees(zero_lift), cm0=cm0,
                                             theory="thin_airfoil_camber_line" if a.airfoil_mode == "naca4" else "user_assumed_coefficients",
                                             thickness_aero_effect=False, viscous_data=False),
                                stability="静安定余裕は線形近似の参考値。トリム・動安定性は未評価。"))
