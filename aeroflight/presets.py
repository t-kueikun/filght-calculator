from dataclasses import asdict
from .model import Aircraft, Conditions, Solver


def presets():
    glider = Aircraft(airfoil_mode="naca4", components=[
        {"name": "主翼", "mass": .15, "x": .07, "z": 0, "iyy": .0005},
        {"name": "胴体", "mass": .12, "x": .10, "z": .01, "iyy": .004},
        {"name": "尾翼", "mass": .03, "x": .465, "z": 0, "iyy": .0001},
        {"name": "機首ウェイト", "mass": .02, "x": -.15, "z": 0, "iyy": .00001}])
    powered = Aircraft(name="RC-02 プロペラ機", kind="powered", airfoil_mode="naca4", mass=.65, span=1.2, root_chord=.21,
                       cg_mac=.30, iyy=.025, tail_area=.05, tail_span=.5, tail_arm=.50,
                       tail_incidence=-.6, body_cda=.003, throttle=.65,
                       components=[{"name":"機体", "mass":.48, "x":.12, "z":0, "iyy":.02},
                                   {"name":"バッテリー", "mass":.12, "x":-.05, "z":.02, "iyy":.0003},
                                   {"name":"モーター", "mass":.05, "x":-.22, "z":0, "iyy":.0001}])
    return [dict(id=a.kind, aircraft=a.to_dict(), conditions=asdict(c), solver=asdict(Solver())) for a,c in
            [(glider, Conditions()), (powered, Conditions(speed=11, height=10, launch_angle=3, pitch=3))]]
