from dataclasses import replace
import math
import numpy as np
import pytest
from scipy.integrate import quad
from aeroflight import Aircraft, Conditions, simulate
from aeroflight.airfoil import thin_airfoil
from aeroflight.aero import forces
from aeroflight.simulation import initial_state


def test_symmetric_airfoil_has_zero_camber_moment_and_zero_lift_angle():
    for p in (.1, .4, .8):
        assert thin_airfoil(0, p) == (0, 0)
    a = Aircraft(airfoil_mode='naca4',camber=0,incidence=0)
    c = Conditions(pitch=0,launch_angle=0)
    f = forces(initial_state(c),a,c)
    assert f['lift'] == 0
    assert f['wing_moment'] == 0


@pytest.mark.parametrize('m,p', [(.01,.1),(.02,.4),(.04,.6),(.06,.8)])
def test_exact_camber_integrals_against_independent_quadrature(m,p):
    def slope(theta):
        x = (1-math.cos(theta))/2
        return 2*m/(p*p if x<p else (1-p)**2)*(p-x)
    boundary=math.acos(1-2*p)
    alpha = quad(lambda t:slope(t)*(1-math.cos(t)),0,math.pi,points=[boundary],epsabs=1e-11)[0]/math.pi
    cm = .5*quad(lambda t:slope(t)*(math.cos(2*t)-math.cos(t)),0,math.pi,points=[boundary],epsabs=1e-11)[0]
    assert thin_airfoil(m,p) == pytest.approx((alpha,cm),abs=1e-11)


def test_naca2412_thin_airfoil_reference_values():
    alpha,cm=thin_airfoil(.02,.4)
    assert math.degrees(alpha) == pytest.approx(-2.0772404,abs=1e-6)
    assert cm == pytest.approx(-.0531195,abs=1e-7)


def test_camber_changes_lift_moment_and_flight_path():
    c = Conditions()
    flat = Aircraft(airfoil_mode='naca4',camber=0)
    cambered = replace(flat,camber=.02)
    ff,fc = forces(initial_state(c),flat,c),forces(initial_state(c),cambered,c)
    assert fc['lift'] > ff['lift']
    assert fc['wing_moment'] != pytest.approx(ff['wing_moment'])
    assert simulate(flat,c)['summary']['distance'] != pytest.approx(simulate(cambered,c)['summary']['distance'])


def test_thickness_is_not_falsely_claimed_to_change_inviscid_aerodynamics():
    a,c = Aircraft(airfoil_mode='naca4'),Conditions()
    thin,thick = simulate(a,c),simulate(replace(a,thickness=.18),c)
    for key in ('x','h','pitch','lift','drag'):
        assert np.array([r[key] for r in thin['rows']]) == pytest.approx([r[key] for r in thick['rows']])
    assert thin['provenance']['airfoil']['thickness_aero_effect'] is False
    assert any('翼厚' in w for w in thin['warnings'])


def test_legacy_json_preserves_manual_aerodynamic_values():
    old=Aircraft().to_dict()
    for field in ('airfoil_mode','camber','camber_position','thickness'):
        old.pop(field)
    restored=Aircraft(**old)
    assert restored.airfoil_mode == 'manual'
    assert restored.airfoil_coefficients == pytest.approx((math.radians(-2),-.04))


@pytest.mark.parametrize('kwargs',[{'camber':-.1},{'camber':.1},{'camber_position':0},{'thickness':.5},{'airfoil_mode':'xfoil'}])
def test_invalid_airfoil_rejected(kwargs):
    with pytest.raises(ValueError):
        Aircraft(**kwargs)
