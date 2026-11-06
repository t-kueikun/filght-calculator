import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aircraftMesh,geometry,nacaSection,thinAirfoil,datFile,normalizeConfig} from '../src/geometry.ts';

const base={name:'Test',kind:'glider',span:1,root_chord:.18,taper:1,incidence:0,
 mass_mode:'manual',mass:.32,cg_mac:.3,iyy:.008,components:[],airfoil_mode:'naca4',
 camber:.02,camber_position:.4,thickness:.12,tail_area:.035,tail_span:.4,tail_arm:.42,
 tail_incidence:0,elevator:0,tail_efficiency:.9,oswald:.8,zero_lift:-2,cm0:-.04};
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);

test('symmetric NACA geometry has closed edges and requested thickness',()=>{
 const foil=nacaSection(0,.4,.12,401);
 for(const p of foil){near(p.upper[0],p.lower[0]);near(p.upper[1],-p.lower[1])}
 near(foil[0].upper[0],0);near(foil[0].upper[1],0);
 near(foil.at(-1).upper[0],1);near(foil.at(-1).upper[1],0);
 near(Math.max(...foil.map(p=>p.upper[1]-p.lower[1])),.12,.0001);
});

test('camber maximum has requested location and height',()=>{
 const foil=nacaSection(.04,.4,.12,801);
 const highest=foil.reduce((best,p)=>p.camber>best.camber?p:best,foil[0]);
 near(highest.camber,.04,.00001);near(highest.x,.4,.002);
 near(thinAirfoil(.02,.4).zeroLift,-2.0772404049,1e-8);
 near(thinAirfoil(.02,.4).cm0,-.05311951346,1e-10);
});

test('rendered 3D wing uses actual span and root chord, tail uses specified area',()=>{
 const a={...base,span:1.4,root_chord:.2,taper:.5},g=geometry(a);
 const points=aircraftMesh(a).filter(f=>f.part==='wing').flatMap(f=>f.points);
 near(Math.max(...points.map(p=>p[0]))-.5*a.span,0);
 near(Math.min(...points.map(p=>p[0]))+.5*a.span,0);
 const root=points.filter(p=>p[0]===0);
 near(Math.max(...root.map(p=>p[2])),.2);
 near(g.mac,2*.2/3*(1+.5+.25)/1.5);
 near(g.tailChord*a.tail_span,a.tail_area);
 near(g.area,.21);
});

test('component CG and inertia shown on model match weighted physical definitions',()=>{
 const a={...base,mass_mode:'components',components:[{mass:.1,x:0,z:0,iyy:.001},{mass:.3,x:.4,z:.04,iyy:.002}]};
 const g=geometry(a);near(g.mass,.4);near(g.cg,.3);near(g.cgZ,.03);near(g.iyy,.01512);
});

test('DAT is normalized and old configuration migration preserves manual mode',()=>{
 const lines=datFile(base).trim().split('\n');assert.match(lines[0],/NACA 2412/);
 const coordinates=lines.slice(1).map(p=>p.split(' ').map(Number));
 near(coordinates[0][0],1);near(coordinates.at(-1)[0],1);
 assert.ok(coordinates.some(p=>p[0]===0));
 const old={...base};delete old.airfoil_mode;delete old.camber;
 const restored=normalizeConfig({aircraft:old}).aircraft;
 assert.equal(restored.airfoil_mode,'manual');near(restored.zero_lift,-2);
});
