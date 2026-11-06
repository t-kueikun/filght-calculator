import math
from dataclasses import replace
import numpy as np
import pytest
from scipy.integrate import solve_ivp
from aeroflight import Aircraft, Component, Conditions, Solver, mass_properties, simulate
from aeroflight.aero import forces, coefficients, body_to_earth, earth_to_body, G
from aeroflight.simulation import initial_state, derivatives


def test_geometry_and_mass_properties():
    a = Aircraft(span=1.2, root_chord=.2, taper=.5)
    assert a.area == pytest.approx(.18)
    assert a.mac == pytest.approx(7 / 45)
    assert a.ar == pytest.approx(8)
    m, x, z, i = mass_properties([Component(mass=.1, x=0, iyy=.001), Component(mass=.3, x=.4, iyy=.002)])
    assert (m, x, z, i) == pytest.approx((.4, .3, 0, .015))


@pytest.mark.parametrize('theta', [-2., -.1, 0, .5, 2.9])
def test_coordinate_inverse(theta):
    assert earth_to_body(*body_to_earth(12, 3, theta), theta) == pytest.approx((12, 3))


def test_alpha_independent_of_launch_pitch():
    c = Conditions(launch_angle=3, pitch=8)
    f = forces(initial_state(c), Aircraft(), c)
    assert f['alpha'] == pytest.approx(5)


def test_force_quadratic_scaling_and_drag_polar():
    a, c = Aircraft(), Conditions()
    one = forces(initial_state(c), a, c)
    two = forces(initial_state(replace(c, speed=18)), a, c)
    for key in ('lift', 'tail_lift', 'drag', 'M'):
        assert two[key] == pytest.approx(4 * one[key])
    cl, cd = coefficients(.1, 6)
    assert cd == pytest.approx(.025 + cl**2 / (math.pi * .8 * 6))


def test_uniform_wind_galilean_invariance():
    # Same air velocity, different ground frame, constant wind.
    a, calm = Aircraft(), Conditions(launch_angle=0, pitch=3, speed=9)
    windy = replace(calm, wind=3, speed=12)
    for key in ('airspeed', 'alpha', 'X', 'Z', 'M'):
        assert forces(initial_state(calm), a, calm)[key] == pytest.approx(forces(initial_state(windy), a, windy)[key])
    one, two = simulate(a, calm), simulate(a, windy)
    assert one['summary']['flight_time'] == pytest.approx(two['summary']['flight_time'], abs=2e-5)
    assert two['summary']['distance'] - one['summary']['distance'] == pytest.approx(3 * one['summary']['flight_time'], abs=2e-4)


def test_cg_changes_moment_and_trajectory():
    a, c = Aircraft(), Conditions()
    b = replace(a, cg_mac=.4)
    f1, f2 = forces(initial_state(c), a, c), forces(initial_state(c), b, c)
    assert f2['M'] - f1['M'] == pytest.approx(-.1 * a.mac * (f1['Z']))
    assert abs(simulate(a, c)['summary']['distance'] - simulate(b, c)['summary']['distance']) > .1


def test_larger_mass_increases_stall_speed():
    a, c = Aircraft(), Conditions()
    one, two = simulate(a, c), simulate(replace(a, mass=.64), c)
    assert two['summary']['stall_speed'] / one['summary']['stall_speed'] == pytest.approx(math.sqrt(2))


def test_zero_thrust_common_engine_and_throttle():
    a, c = Aircraft(), Conditions()
    base = simulate(a, c)
    zero = simulate(replace(a, kind='powered', throttle=0), c)
    assert np.array([r['x'] for r in base['rows']]) == pytest.approx([r['x'] for r in zero['rows']])
    f = forces(initial_state(c), replace(a, kind='powered', thrust_mode='fixed', thrust=4, throttle=.5, thrust_z=.02), c)
    assert f['thrust'] == 2
    assert f['thrust_moment'] == pytest.approx(.04)


def test_thrust_curve_interpolates_and_clamps():
    a = Aircraft(kind='powered', throttle=1, thrust_curve=[[0, 4], [10, 2], [20, 0]])
    c = Conditions(speed=5, pitch=0, launch_angle=0)
    assert forces(initial_state(c), a, c)['thrust'] == pytest.approx(3)
    c = replace(c, speed=30)
    assert forces(initial_state(c), a, c)['thrust'] == 0


def test_thrust_changes_acceleration_by_force_over_mass():
    a, c = Aircraft(kind='powered', thrust_mode='fixed', thrust=4, throttle=1), Conditions()
    y = initial_state(c)
    on = derivatives(0, y, a, c)
    off = derivatives(0, y, replace(a, throttle=0), c)
    assert on[2] - off[2] == pytest.approx(4 / a.mass)
    assert on[3] == pytest.approx(off[3])


def test_vertical_component_position_changes_aero_moment():
    a = Aircraft(mass_mode='components', components=[Component(mass=.32,x=.054,z=0,iyy=.008)])
    b = replace(a, components=[Component(mass=.32,x=.054,z=.03,iyy=.008)])
    c = Conditions()
    f1, f2 = forces(initial_state(c),a,c), forces(initial_state(c),b,c)
    # With q=0 the same forces act at a different vertical lever arm.
    assert f1['lift'] == pytest.approx(f2['lift'])
    assert f1['M'] != pytest.approx(f2['M'])


def test_energy_no_propulsion_decreases():
    a, c = Aircraft(), Conditions()
    result = simulate(a, c, Solver(sample_dt=.02))
    energies = np.array([a.mass * (G * r['h'] + .5 * r['groundspeed']**2) + .5 * a.iyy * math.radians(r['pitch_rate'])**2 for r in result['rows']])
    assert np.max(np.diff(energies)) < 2e-4
    assert energies[-1] < energies[0]


def test_ideal_gravity_only_energy_and_analytic_trajectory(monkeypatch):
    import aeroflight.simulation as engine
    monkeypatch.setattr(engine, 'forces', lambda *args: dict(X=0, Z=0, M=0))
    a, c = Aircraft(), Conditions(height=20, launch_angle=10, pitch=20, pitch_rate=10)
    t = 1.2
    sol = solve_ivp(lambda t,y: derivatives(t,y,a,c), (0,t), initial_state(c), rtol=1e-10, atol=1e-12, max_step=.01)
    x,h,u,w,_,q = sol.y[:,-1]
    gamma = math.radians(c.launch_angle)
    assert x == pytest.approx(c.speed * math.cos(gamma)*t, abs=1e-8)
    assert h == pytest.approx(c.height+c.speed*math.sin(gamma)*t-.5*G*t*t, abs=1e-8)
    assert G*h+.5*(u*u+w*w) == pytest.approx(G*c.height+.5*c.speed**2, abs=1e-7)


def test_step_convergence_and_ground_event():
    a, c = Aircraft(), Conditions()
    coarse = simulate(a, c, Solver(max_step=.04))
    fine = simulate(a, c, Solver(max_step=.005))
    assert coarse['status'] == fine['status'] == 'ground'
    assert coarse['summary']['distance'] == pytest.approx(fine['summary']['distance'], abs=1e-3)
    assert coarse['landing']['time'] == pytest.approx(fine['landing']['time'], abs=1e-4)
    assert fine['rows'][-1]['h'] == pytest.approx(0, abs=1e-8)
    assert fine['rows'][-1]['t'] == fine['landing']['time']


def test_output_interval_does_not_change_integration():
    a, c = Aircraft(), Conditions()
    fine = simulate(a,c,Solver(sample_dt=.02))
    sparse = simulate(a,c,Solver(sample_dt=.5))
    assert len(fine['rows']) > len(sparse['rows'])
    assert sparse['landing'] == fine['landing']


def test_component_mode_changes_dynamics():
    a = Aircraft(mass_mode='components', components=[Component(mass=.15,x=0), Component(mass=.17,x=.13)])
    r = simulate(a, Conditions())
    assert r['summary']['mass'] == pytest.approx(.32)
    assert r['summary']['cg_mac'] == pytest.approx((.17*.13/.32)/.18)


@pytest.mark.parametrize('field,value', [('mass',0),('iyy',0),('span',float('nan')),('taper',2),('cg_mac',float('inf'))])
def test_reject_invalid_aircraft(field, value):
    with pytest.raises(ValueError):
        Aircraft(**{field:value})


def test_reject_out_of_envelope():
    with pytest.raises(ValueError, match='有効範囲'):
        simulate(Aircraft(), Conditions(speed=1, wind=3))


def test_all_major_inputs_change_output():
    a, c = Aircraft(), Conditions()
    baseline = simulate(a,c)['summary']['distance']
    for aircraft, conditions in [(replace(a,mass=.4),c),(replace(a,root_chord=.21),c),(replace(a,span=1.2),c),
                                 (replace(a,cg_mac=.35),c),(replace(a,iyy=.02),c),(replace(a,tail_area=.045),c),
                                 (a,replace(c,speed=11)),(a,replace(c,wind=-1)),(a,replace(c,density=1.1))]:
        assert abs(simulate(aircraft,conditions)['summary']['distance'] - baseline) > 1e-3
