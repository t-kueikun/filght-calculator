"""Forces/moments separate from integration; body +x forward, +z down."""
import math
import numpy as np

G = 9.80665


def body_to_earth(u, w, theta):
    return u * math.cos(theta) + w * math.sin(theta), u * math.sin(theta) - w * math.cos(theta)


def earth_to_body(vx, vh, theta):
    return vx * math.cos(theta) + vh * math.sin(theta), vx * math.sin(theta) - vh * math.cos(theta)


def lift_slope(ar, oswald=.8):
    return 2 * math.pi / (1 + 2 / (oswald * ar))


def coefficients(alpha, ar, zero_lift=0., cd0=.025, oswald=.8, cl_max=1.15):
    raw = lift_slope(ar, oswald) * (alpha - zero_lift)
    # Continuous bounded extension for event localization only, no post-stall fidelity.
    cl = float(np.clip(raw, -cl_max, cl_max))
    excess = max(0., abs(alpha - zero_lift) - cl_max / lift_slope(ar, oswald))
    cd = cd0 + cl * cl / (math.pi * oswald * ar) + 1.5 * math.sin(min(excess, math.pi / 2))**2
    return cl, cd


def forces(state, aircraft, conditions):
    _, _, u, w, theta, q = state
    a, c = aircraft, conditions
    mass, cg, cg_z, _ = a.properties
    # u,w are GROUND velocity. Subtract wind once, in body coordinates.
    wind_u, wind_w = earth_to_body(c.wind, 0, theta)
    ua, wa = u - wind_u, w - wind_w
    speed = math.hypot(ua, wa)
    alpha = math.atan2(wa, ua)
    pressure = .5 * c.density * speed**2
    wing_arm = cg - .25 * a.mac
    surface_u = ua - q * cg_z  # aerodynamic centers have design z = 0
    wing_w = wa - q * wing_arm
    flow = math.atan2(wing_w, surface_u)
    wing_alpha = flow + math.radians(a.incidence)
    zero_lift, cm0 = a.airfoil_coefficients
    cl, cd = coefficients(wing_alpha, a.ar, zero_lift, a.cd0, a.oswald, a.cl_max)
    wing_pressure = .5 * c.density * (surface_u * surface_u + wing_w * wing_w)
    lift = wing_pressure * a.area * cl
    drag_wing = wing_pressure * a.area * cd
    xw = lift * math.sin(flow) - drag_wing * math.cos(flow)
    zw = -lift * math.cos(flow) - drag_wing * math.sin(flow)
    downwash = 2 * cl / (math.pi * a.ar)
    tail_arm = cg - (.25 * a.mac + a.tail_arm)
    tail_w = wa - q * tail_arm
    tail_flow = math.atan2(tail_w, surface_u)
    tail_alpha = tail_flow + math.radians(a.tail_incidence + .55 * a.elevator) - downwash
    tail_ar = a.tail_span**2 / a.tail_area
    ctl, ctd = coefficients(tail_alpha, tail_ar, 0, .015, a.oswald, 1.0)
    tail_pressure = .5 * c.density * (surface_u * surface_u + tail_w * tail_w) * a.tail_efficiency
    lt, dt = tail_pressure * a.tail_area * ctl, tail_pressure * a.tail_area * ctd
    xt, zt = lt * math.sin(tail_flow) - dt * math.cos(tail_flow), -lt * math.cos(tail_flow) - dt * math.sin(tail_flow)
    db = pressure * a.body_cda
    thrust = 0.
    if a.kind == "powered":
        thrust = a.throttle * (a.thrust if a.thrust_mode == "fixed" else float(np.interp(speed, *np.array(a.thrust_curve).T)))
    angle = math.radians(a.thrust_angle)
    tx, tz = thrust * math.cos(angle), -thrust * math.sin(angle)
    moment_wing = -wing_arm * zw - cg_z * xw + wing_pressure * a.area * a.mac * cm0
    moment_tail = -tail_arm * zt - cg_z * xt
    moment_thrust = a.thrust_z * tx
    # viscosity from Sutherland's law; rho specified independently.
    kelvin = c.temperature + 273.15
    viscosity = 1.716e-5 * (kelvin / 273.15)**1.5 * (273.15 + 110.4) / (kelvin + 110.4)
    return dict(X=xw + xt - db * math.cos(alpha) + tx,
                Z=zw + zt - db * math.sin(alpha) + tz,
                M=moment_wing + moment_tail + moment_thrust,
                wing_moment=moment_wing, tail_moment=moment_tail, thrust_moment=moment_thrust,
                airspeed=speed, groundspeed=math.hypot(u, w), alpha=math.degrees(alpha),
                wing_alpha=math.degrees(wing_alpha), tail_alpha=math.degrees(tail_alpha),
                lift=lift, tail_lift=lt, drag=drag_wing + dt + db, thrust=thrust, weight=mass * G,
                cl=cl, cd=cd, reynolds=c.density * speed * a.mac / viscosity)
