import { memo, useMemo, useRef, useState } from "react";
import { Box, Download, Move, RotateCcw } from "lucide-react";
import type { Aircraft } from "./types";
import {
  aircraftMesh,
  datFile,
  foilName,
  geometry,
  mainSection,
  nacaSection,
  type V3,
} from "./geometry";

type View = "3d" | "plan" | "side";
const f = (v: number, n = 1) => (Number.isFinite(v) ? v.toFixed(n) : "—");

function SectionView({ a }: { a: Aircraft }) {
  const [reference, setReference] = useState(false);
  const foil = useMemo(
    () => mainSection(a),
    [a.airfoil_mode, a.camber, a.camber_position, a.thickness],
  );
  const g = geometry(a),
    isNaca = a.airfoil_mode === "naca4";
  const project = ([x, y]: [number, number]) => [28 + x * 330, 99 - y * 330];
  const path = (pts: [number, number][]) =>
    pts.map((p, i) => `${i ? "L" : "M"} ${project(p).join(" ")}`).join(" ");
  const outline =
    path([...foil.map((p) => p.upper), ...foil.map((p) => p.lower).reverse()]) +
    " Z";
  const referenceFoil = nacaSection(0, 0.4, a.thickness);
  function exportDat() {
    const url = URL.createObjectURL(
      new Blob([datFile(a)], { type: "text/plain;charset=utf-8" }),
    );
    const el = document.createElement("a");
    el.href = url;
    el.download = foilName(a).replaceAll(" ", "-") + ".dat";
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="foil-preview">
      <div className="foil-title">
        <div>
          <span className="eyebrow">AIRFOIL SECTION</span>
          <h4 data-testid="foil-name">{foilName(a)}</h4>
        </div>
        <button className="text-button" disabled={!isNaca} onClick={exportDat}>
          <Download size={12} />
          DAT
        </button>
      </div>
      <svg
        role="img"
        aria-label="主翼の翼型断面"
        viewBox="0 0 390 182"
        className="foil-svg"
      >
        <defs>
          <pattern
            id="foil-grid"
            width="33"
            height="33"
            patternUnits="userSpaceOnUse"
            x="28"
            y="0"
          >
            <path
              d="M 33 0 L 0 0 0 33"
              fill="none"
              stroke="#edf0e9"
              strokeWidth=".7"
            />
          </pattern>
        </defs>
        <rect x="15" y="15" width="360" height="135" fill="url(#foil-grid)" />
        <line
          x1="28"
          y1="99"
          x2="358"
          y2="99"
          stroke="#b8c3b5"
          strokeDasharray="4 3"
        />
        {reference && isNaca && (
          <path
            d={
              path([
                ...referenceFoil.map((p) => p.upper),
                ...referenceFoil.map((p) => p.lower).reverse(),
              ]) + " Z"
            }
            fill="none"
            stroke="#adb9c5"
            strokeWidth="1.2"
            strokeDasharray="4 3"
          />
        )}
        <path
          data-testid="foil-outline"
          d={outline}
          fill="rgba(57,125,102,.12)"
          stroke="#397d66"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d={path(foil.map((p) => [p.x, p.camber]))}
          fill="none"
          stroke="#bf9354"
          strokeWidth="1.1"
          strokeDasharray="4 3"
        />
        <circle cx={28} cy={99} r="2.5" fill="#71856c" />
        <circle cx={358} cy={99} r="2.5" fill="#71856c" />
        <text x="28" y="163" className="svg-label">
          前縁 0%
        </text>
        <text x="358" y="163" textAnchor="end" className="svg-label">
          後縁 100%
        </text>
      </svg>
      <div className="foil-legend">
        <span>
          <i className="key-line green" />
          翼型断面
        </span>
        <span>
          <i className="key-line gold" />
          キャンバー線
        </span>
        <span>縦横 1:1</span>
      </div>
      <label className="reference-label">
        <input
          type="checkbox"
          checked={reference}
          disabled={!isNaca}
          onChange={(e) => setReference(e.target.checked)}
        />
        同じ厚みの対称翼を重ねる
      </label>
      <div className="foil-dimensions">
        <span>
          翼根での厚み{" "}
          <b>
            {isNaca ? f(a.root_chord * a.thickness * 1000) : "未指定"}{" "}
            {isNaca ? "mm" : ""}
          </b>
        </span>
        <span>
          最大キャンバー{" "}
          <b>
            {isNaca ? f(a.root_chord * a.camber * 1000) : "未指定"}{" "}
            {isNaca ? "mm" : ""}
          </b>
        </span>
      </div>
      <div className="foil-coefficients">
        <div>
          <span>計算に使う零揚力角</span>
          <strong data-testid="effective-alpha">
            {f(g.effective.zeroLift, 2)}
            <small>°</small>
          </strong>
        </div>
        <div>
          <span>計算に使う Cm₀</span>
          <strong data-testid="effective-cm">{f(g.effective.cm0, 4)}</strong>
        </div>
      </div>
      <p className="preview-caveat">
        {isNaca
          ? "キャンバー → 薄翼理論の零揚力角・Cm → 飛行計算に連動。厚みは形状表示に反映し、粘性抗力・失速特性への影響は未計算です。"
          : "空力係数は手入力値を使用します。断面は翼型未指定を示す薄板の模式表示です。"}
      </p>
    </div>
  );
}

function AircraftPreview({ aircraft: a }: { aircraft: Aircraft }) {
  const [view, setView] = useState<View>("3d"),
    [yaw, setYaw] = useState(-0.58),
    [pitch, setPitch] = useState(0.62);
  const drag = useRef<{
    x: number;
    y: number;
    yaw: number;
    pitch: number;
  } | null>(null);
  const faces = useMemo(() => aircraftMesh(a), [a]);
  const g = useMemo(() => geometry(a), [a]);
  const [showComponents, setShowComponents] = useState(true);
  const neutralValid = g.ar >= 2 && Number.isFinite(g.neutral);
  const allPoints: V3[] = [
    ...faces.flatMap((f) => f.points),
    [0, -g.cgZ, g.cg],
    ...(neutralValid ? [[0, 0, g.neutral] as V3] : []),
    ...(a.mass_mode === "components" && showComponents
      ? a.components.map((c) => [0, -c.z, c.x] as V3)
      : []),
  ];
  const centerZ = (-0.8 * a.root_chord + g.tailLE + g.tailChord) / 2;
  // Orthographic projection keeps the actual proportions independent of depth.
  function raw([x, y, z0]: V3) {
    const z = z0 - centerZ;
    if (view === "plan") return [x, -z, -y];
    if (view === "side") return [z, y, -x];
    const h = x * Math.cos(yaw) + z * Math.sin(yaw),
      d = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return [
      h,
      y * Math.cos(pitch) + d * Math.sin(pitch),
      d * Math.cos(pitch) - y * Math.sin(pitch),
    ];
  }
  const bounds = allPoints.map(raw),
    xs = bounds.map((p) => p[0]),
    ys = bounds.map((p) => p[1]);
  const rangeX = Math.max(...xs) - Math.min(...xs),
    rangeY = Math.max(...ys) - Math.min(...ys);
  const scale = Math.min(
    680 / Math.max(rangeX, 0.03),
    235 / Math.max(rangeY, 0.18),
  );
  const offsetX = 400 - ((Math.max(...xs) + Math.min(...xs)) / 2) * scale;
  const offsetY = 163 + ((Math.max(...ys) + Math.min(...ys)) / 2) * scale;
  function project(v: V3) {
    const p = raw(v);
    return [offsetX + p[0] * scale, offsetY - p[1] * scale, p[2]];
  }
  const projected = faces
    .map((face) => {
      const pts = face.points.map(project);
      return {
        ...face,
        pts,
        depth: pts.reduce((s, p) => s + p[2], 0) / pts.length,
      };
    })
    .sort((a, b) => b.depth - a.depth);
  const cg = project([0, -g.cgZ, g.cg]),
    neutral = project([0, 0, g.neutral]);
  const line = (from: V3, to: V3) => {
    const p = project(from),
      q = project(to);
    return { x1: p[0], y1: p[1], x2: q[0], y2: q[1] };
  };
  const wingSpanY = project([0, 0, 0])[1];
  function reset() {
    setYaw(-0.58);
    setPitch(0.62);
  }
  function shade(face: (typeof projected)[number]) {
    const hue =
      face.part === "wing"
        ? 151
        : face.part === "elevator"
          ? 168
          : face.part === "tail"
            ? 142
            : face.part === "prop"
              ? 204
              : 94;
    const light =
      face.part === "body"
        ? 68
        : face.part === "prop"
          ? 42
          : face.upper
            ? 57
            : 42;
    const pts = face.points,
      p = pts[0],
      q = pts[1],
      r = pts[2];
    const u = q.map((v, i) => v - p[i]),
      v = r.map((n, i) => n - p[i]);
    const n = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const brightness =
      Math.abs(
        (n[0] * 0.3 + n[1] * 0.8 + n[2] * 0.5) / (Math.hypot(...n) || 1),
      ) * 8;
    return `hsl(${hue} ${face.part === "body" ? 8 : 29}% ${light + brightness}%)`;
  }
  return (
    <section className="aircraft-preview panel">
      <div className="preview-header">
        <div className="panel-title">
          <Box size={16} />
          <h2>機体形状</h2>
          <span className="live-shape">
            <i />
            入力に即時連動
          </span>
        </div>
        <div className="view-buttons">
          <button
            className="edit-foil-button"
            onClick={() => {
              const panel = document.querySelector<HTMLElement>(".sidebar");
              const section = panel?.querySelector<HTMLDetailsElement>(
                '[data-section="翼型断面"]',
              );
              if (panel && section) {
                section.open = true;
                panel.scrollTo({
                  top: section.offsetTop - 56,
                  behavior: "smooth",
                });
              }
            }}
          >
            翼型を編集
          </button>
          {(
            [
              ["3d", "3D"],
              ["plan", "上面"],
              ["side", "側面"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={view === key}
              className={view === key ? "active" : ""}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
          <button aria-label="形状ビューをリセット" onClick={reset}>
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
      <div className="shape-layout">
        <div className="aircraft-viewport">
          <div className="viewport-top">
            <span>
              {a.kind === "powered"
                ? "PROPELLER AIRCRAFT"
                : "HAND-LAUNCH GLIDER"}{" "}
              /{" "}
              {view === "plan"
                ? "PLAN"
                : view === "side"
                  ? "SIDE"
                  : "ISOMETRIC"}
            </span>
            <span>
              {view === "3d" ? (
                <>
                  <Move size={11} /> ドラッグ・矢印キーで回転
                </>
              ) : (
                "縮尺は縦横で共通"
              )}
            </span>
          </div>
          <svg
            role="img"
            aria-label={`機体形状 ${view === "3d" ? "3Dビュー" : view === "plan" ? "上面図" : "側面図"}`}
            data-testid="aircraft-svg"
            viewBox="0 0 800 340"
            tabIndex={view === "3d" ? 0 : undefined}
            className={"aircraft-svg " + (view === "3d" ? "rotatable" : "")}
            onPointerDown={(e) => {
              if (view !== "3d") return;
              drag.current = { x: e.clientX, y: e.clientY, yaw, pitch };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current || view !== "3d") return;
              setYaw(drag.current.yaw + (e.clientX - drag.current.x) * 0.008);
              setPitch(
                Math.max(
                  -1.2,
                  Math.min(
                    1.4,
                    drag.current.pitch + (e.clientY - drag.current.y) * 0.008,
                  ),
                ),
              );
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onKeyDown={(e) => {
              if (view !== "3d") return;
              if (e.key === "ArrowLeft") {
                setYaw((v) => v - 0.1);
                e.preventDefault();
              }
              if (e.key === "ArrowRight") {
                setYaw((v) => v + 0.1);
                e.preventDefault();
              }
              if (e.key === "ArrowUp") {
                setPitch((v) => Math.min(1.4, v + 0.1));
                e.preventDefault();
              }
              if (e.key === "ArrowDown") {
                setPitch((v) => Math.max(-1.2, v - 0.1));
                e.preventDefault();
              }
            }}
          >
            <defs>
              <pattern
                id="aircraft-dots"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1" cy="1" r=".65" fill="#d8e0d4" />
              </pattern>
            </defs>
            <rect width="800" height="340" fill="url(#aircraft-dots)" />
            <g className="aircraft-mesh" data-testid="aircraft-mesh">
              {projected.map((face, i) => (
                <path
                  key={i}
                  data-part={face.part}
                  d={
                    face.pts
                      .map(
                        (p, j) =>
                          `${j ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`,
                      )
                      .join(" ") + "Z"
                  }
                  fill={shade(face)}
                  stroke={face.part === "body" ? "#768371" : "#4c7964"}
                  strokeWidth=".3"
                  strokeOpacity=".25"
                />
              ))}
            </g>
            <line
              {...line([-a.span / 2, 0, 0], [a.span / 2, 0, 0])}
              stroke="#3c6857"
              strokeWidth="1"
              strokeOpacity=".65"
            />
            <line
              {...line([g.macSpan, 0, 0], [g.macSpan, 0, g.mac])}
              stroke="#6b85ac"
              strokeDasharray="4 3"
              strokeWidth="1.5"
            />
            {a.mass_mode === "components" &&
              showComponents &&
              a.components.map((c, i) => {
                const p = project([0, -c.z, c.x]);
                return (
                  <g key={i}>
                    <circle
                      cx={p[0]}
                      cy={p[1]}
                      r={3 + Math.min(5, Math.sqrt(c.mass) * 6)}
                      fill="#6484b3"
                      fillOpacity=".5"
                      stroke="white"
                    />
                    <title>
                      {c.name}: {f(c.mass * 1000, 0)}g, x={f(c.x * 1000)}mm
                    </title>
                  </g>
                );
              })}
            {neutralValid && (
              <g
                data-testid="neutral-marker"
                transform={`translate(${neutral[0]},${neutral[1]})`}
              >
                <circle r="4" fill="#6886bd" stroke="white" strokeWidth="1.8" />
                <line y1="-7" y2="-21" stroke="#6886bd" />
                <text
                  y="-26"
                  textAnchor="middle"
                  className="svg-label marker-label"
                >
                  中立点 {f((g.neutral / g.mac) * 100)}%
                </text>
              </g>
            )}
            <g
              data-testid="cg-marker"
              transform={`translate(${cg[0]},${cg[1]})`}
            >
              <circle r="8" fill="#fffaf0" stroke="#bf934d" strokeWidth="1.8" />
              <path d="M-6 0H6M0-6V6" stroke="#bf934d" strokeWidth="1.2" />
              <line y1="10" y2="29" stroke="#bf934d" />
              <text
                y="43"
                textAnchor="middle"
                className="svg-label marker-label cg-label"
              >
                CG {f(g.cg * 1000)} mm
              </text>
            </g>
            {view === "plan" && (
              <g>
                <line
                  {...line([-a.span / 2, 0, -0.055], [a.span / 2, 0, -0.055])}
                  stroke="#91a08a"
                />
                <text
                  x="400"
                  y={Math.max(20, wingSpanY - 25)}
                  textAnchor="middle"
                  className="svg-label"
                >
                  翼幅 {f(a.span * 1000, 0)} mm
                </text>
              </g>
            )}
            <text x="20" y="320" className="svg-label">
              {view === "side" ? "← 機首 / 後方 →" : "機首は主翼前縁より前方"}
            </text>
          </svg>
          <div className="shape-metrics">
            <div>
              <span>翼幅</span>
              <b data-testid="preview-span">
                {f(a.span * 1000, 0)}
                <small>mm</small>
              </b>
            </div>
            <div>
              <span>翼根 / 翼端</span>
              <b>
                {f(a.root_chord * 1000, 0)} / {f(g.tipChord * 1000, 0)}
                <small>mm</small>
              </b>
            </div>
            <div>
              <span>翼面積 / AR</span>
              <b>
                {f(g.area * 10000, 0)}
                <small>cm²</small> / {f(g.ar, 2)}
              </b>
            </div>
            <div>
              <span>重心</span>
              <b data-testid="preview-cg">
                {f((g.cg / g.mac) * 100)}
                <small>% MAC</small>
              </b>
            </div>
          </div>
          <div className="shape-legend">
            <span>
              <i className="legend-dot gold" />
              重心
            </span>
            <span>
              <i className="legend-dot blue" />
              中立点（線形近似）
            </span>
            <span>
              <i className="key-line blue" />
              MAC
            </span>
            {a.mass_mode === "components" && (
              <label>
                <input
                  type="checkbox"
                  checked={showComponents}
                  onChange={(e) => setShowComponents(e.target.checked)}
                />
                部品位置
              </label>
            )}
          </div>
          <p className="preview-caveat">
            主翼・尾翼は入力寸法に連動。胴体・プロペラは模式表示です。重心は主翼前縁からの後方距離。重量の変更だけでは寸法は変わりません。
          </p>
        </div>
        <SectionView a={a} />
      </div>
    </section>
  );
}

export default memo(AircraftPreview);
