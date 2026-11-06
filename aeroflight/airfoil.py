"""NACA four-digit mean-line theory. Inviscid, small-angle approximation only."""
from functools import lru_cache
import math


@lru_cache(maxsize=256)
def thin_airfoil(camber: float, position: float) -> tuple[float, float]:
    """Return zero-lift angle [rad] and quarter-chord Cm from camber line.

    x/c = (1-cos(theta))/2; split the integrals exactly at maximum camber.
    Thickness has no effect in this inviscid theory and is deliberately absent.
    """
    if camber == 0:
        return 0.0, 0.0
    boundary = math.acos(1 - 2 * position)
    constant = 2 * position - 1

    def alpha_integral(theta):
        return ((constant - .5) * theta + (1 - constant) * math.sin(theta)
                - .25 * math.sin(2 * theta))

    def moment_integral(theta):
        return (constant * (.5 * math.sin(2 * theta) - math.sin(theta))
                + math.sin(3 * theta) / 6 + .5 * math.sin(theta)
                - .5 * theta - .25 * math.sin(2 * theta))

    def integrate(primitive):
        return (camber / position**2 * (primitive(boundary) - primitive(0))
                + camber / (1 - position)**2 * (primitive(math.pi) - primitive(boundary)))

    return integrate(alpha_integral) / math.pi, .5 * integrate(moment_integral)
