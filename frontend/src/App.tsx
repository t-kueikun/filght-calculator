import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Copy,
  FlaskConical,
  Layers,
  Pause,
  Plane,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  TriangleAlert,
  Wind,
} from "lucide-react";
import { Plot } from "./Plot";
import AircraftPreview from "./AircraftPreview";
import { geometry, normalizeConfig } from "./geometry";
import type {
  Aircraft,
  Conditions,
  Config,
  Result,
  Saved,
  Solver,
} from "./types";

const GREEN = "#397d66",
  BLUE = "#6886bd",
  ORANGE = "#cb8c52",
  COLORS = [BLUE, ORANGE, "#9875b7", "#b65f73", "#599b9d"];
const STORAGE = "aerolab-designs-v1";
const fmt = (v: number | undefined, n = 2) =>
  v === undefined ? "—" : v.toFixed(n);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const statusName = (s: string) =>
  s === "ground"
    ? "接地"
    : s === "duration"
      ? "設定時間に到達"
      : "有効範囲で終了";
async function calculate(
  config: Config,
  signal?: AbortSignal,
): Promise<Result> {
  const res = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    signal,
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "入力値を確認してください。",
    );
  }
  return res.json();
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type FieldProps = {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  factor?: number;
  onChange: (value: number) => void;
  slider?: boolean;
};
function Field({
  label,
  value,
  unit = "",
  min,
  max,
  step = 1,
  factor = 1,
  onChange,
  slider = true,
}: FieldProps) {
  const display = Number((value * factor).toFixed(6));
  const [draft, setDraft] = useState(String(display));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(display));
  }, [display, focused]);
  function commit() {
    setFocused(false);
    const n = Number(draft);
    if (draft.trim() && Number.isFinite(n) && n >= min && n <= max)
      onChange(n / factor);
    else setDraft(String(display));
  }
  return (
    <label className={"field " + (!slider ? "compact" : "")}>
      <span className="field-line">
        <span>{label}</span>
        <span className="field-value">
          <input
            aria-label={label}
            type="number"
            min={min}
            max={max}
            step={step}
            value={draft}
            onFocus={() => setFocused(true)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <span>{unit}</span>
        </span>
      </span>
      {slider && (
        <input
          aria-label={`${label} スライダー`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, display))}
          onChange={(e) => onChange(Number(e.target.value) / factor)}
        />
      )}
    </label>
  );
}

function Section({
  title,
  index,
  children,
  open = false,
}: {
  title: string;
  index: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details className="section" data-section={title} open={open}>
      <summary>
        <span>
          <span className="section-index">{index}</span>
          {title}
        </span>
        <ChevronDown size={14} />
      </summary>
      <div className="section-content">{children}</div>
    </details>
  );
}

function CurveEditor({
  value,
  onChange,
}: {
  value: number[][];
  onChange: (v: number[][]) => void;
}) {
  const [text, setText] = useState(value.map((p) => p.join(", ")).join("\n"));
  const [error, setError] = useState("");
  useEffect(() => {
    setText(value.map((p) => p.join(", ")).join("\n"));
  }, [value]);
  return (
    <>
      <label className="small-label">
        速度 (m/s), 全開推力 (N)
        <textarea
          aria-label="推力曲線"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />
      </label>
      <button
        className="btn small"
        onClick={() => {
          try {
            const data = text
              .trim()
              .split("\n")
              .map((l) => l.split(",").map(Number));
            if (
              data.length < 2 ||
              data.length > 100 ||
              data.some(
                (p, i) =>
                  p.length !== 2 ||
                  p.some((v) => !Number.isFinite(v) || v < 0 || v > 100) ||
                  (i > 0 && p[0] <= data[i - 1][0]),
              )
            )
              throw Error();
            onChange(data);
            setError("");
          } catch {
            setError("2点以上を速度の昇順で入力してください。");
          }
        }}
      >
        曲線を適用
      </button>
      {error && <p className="error-inline">{error}</p>}
    </>
  );
}

function Sidebar({
  config,
  update,
  presets,
  choose,
}: {
  config: Config;
  update: (c: Config) => void;
  presets: (Config & { id: string })[];
  choose: (c: Config) => void;
}) {
  const a = config.aircraft,
    c = config.conditions,
    s = config.solver;
  const A = (key: keyof Aircraft, value: unknown) =>
    update({ ...config, aircraft: { ...a, [key]: value } });
  const C = (key: keyof Conditions, value: number) =>
    update({ ...config, conditions: { ...c, [key]: value } });
  const S = (key: keyof Solver, value: number) =>
    update({ ...config, solver: { ...s, [key]: value } });
  const area = (a.span * a.root_chord * (1 + a.taper)) / 2;
  const field = (
    key: keyof Aircraft,
    label: string,
    min: number,
    max: number,
    unit = "",
    factor = 1,
    step = 1,
    slider = true,
  ) => (
    <Field
      key={key}
      label={label}
      value={a[key] as number}
      min={min}
      max={max}
      unit={unit}
      factor={factor}
      step={step}
      slider={slider}
      onChange={(v) => A(key, v)}
    />
  );
  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <Settings2 size={16} />
        <h2>機体設計</h2>
        <span className="tiny">DESIGN</span>
      </div>
      <div className="design-identity">
        <label className="small-label">
          機体名
          <input
            aria-label="機体名"
            maxLength={100}
            value={a.name}
            onChange={(e) => A("name", e.target.value)}
          />
        </label>
        <div className="segmented">
          <button
            className={a.kind === "glider" ? "active" : ""}
            onClick={() => A("kind", "glider")}
          >
            <Plane size={14} /> グライダー
          </button>
          <button
            className={a.kind === "powered" ? "active" : ""}
            onClick={() => A("kind", "powered")}
          >
            <Compass size={14} /> モーター機
          </button>
        </div>
        <label className="preset-label">
          <Box size={13} />
          <select
            aria-label="サンプル機体"
            value=""
            onChange={(e) => {
              const p = presets.find((p) => p.id === e.target.value);
              if (p) choose(clone(p));
            }}
          >
            <option value="" disabled>
              プリセットから読み込む
            </option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.aircraft.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Section title="重量・重心" index="01" open>
        <div className="segmented muted">
          <button
            className={a.mass_mode === "manual" ? "active" : ""}
            onClick={() => A("mass_mode", "manual")}
          >
            直接入力
          </button>
          <button
            className={a.mass_mode === "components" ? "active" : ""}
            onClick={() => {
              if (!a.components.length)
                A("components", [
                  { name: "機体", mass: 0.32, x: 0.054, z: 0, iyy: 0.008 },
                ]);
              update({
                ...config,
                aircraft: {
                  ...a,
                  mass_mode: "components",
                  components: a.components.length
                    ? a.components
                    : [
                        {
                          name: "機体",
                          mass: 0.32,
                          x: 0.054,
                          z: 0,
                          iyy: 0.008,
                        },
                      ],
                },
              });
            }}
          >
            部品から算出
          </button>
        </div>
        {a.mass_mode === "manual" ? (
          <>
            {field("mass", "総重量", 20, 20000, "g", 1000, 5)}
            {field("cg_mac", "重心位置", -50, 150, "% MAC", 100, 0.5)}
            {field(
              "iyy",
              "ピッチ慣性 Iyy",
              0.00001,
              10,
              "kg·m²",
              1,
              0.001,
              false,
            )}
          </>
        ) : (
          <>
            <p className="hint">
              位置 x は主翼前縁から後方、z は下方を正とします。単位：g / mm。
            </p>
            {a.components.map((p, i) => (
              <div className="component" key={i}>
                <div className="component-title">
                  <input
                    aria-label={`部品${i + 1} 名称`}
                    value={p.name}
                    onChange={(e) =>
                      A(
                        "components",
                        a.components.map((v, j) =>
                          i === j ? { ...v, name: e.target.value } : v,
                        ),
                      )
                    }
                  />
                  <button
                    className="icon-button"
                    aria-label={`部品${i + 1} 削除`}
                    onClick={() =>
                      A(
                        "components",
                        a.components.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="component-fields">
                  {(["mass", "x", "z", "iyy"] as const).map((key) => (
                    <Field
                      key={key}
                      label={`${i + 1} ${key}`}
                      value={p[key]}
                      min={key === "mass" ? 0.01 : key === "iyy" ? 0 : -5000}
                      max={key === "mass" ? 20000 : key === "iyy" ? 10 : 5000}
                      factor={key === "iyy" ? 1 : 1000}
                      unit={
                        key === "mass" ? "g" : key === "iyy" ? "kg·m²" : "mm"
                      }
                      step={key === "iyy" ? 0.0001 : 1}
                      slider={false}
                      onChange={(v) =>
                        A(
                          "components",
                          a.components.map((p, j) =>
                            i === j ? { ...p, [key]: v } : p,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
            <button
              className="btn small wide"
              onClick={() =>
                A("components", [
                  ...a.components,
                  { name: "部品", mass: 0.02, x: 0.1, z: 0, iyy: 0.0001 },
                ])
              }
            >
              <Plus size={13} />
              部品を追加
            </button>
          </>
        )}
      </Section>
      <Section title="主翼" index="02" open>
        {field("span", "翼幅", 100, 5000, "mm", 1000, 10)}
        {field("root_chord", "翼根翼弦長", 30, 1000, "mm", 1000, 5)}
        {field("taper", "テーパー比", 0.1, 1, "", 1, 0.05)}
        <div className="derived">
          <span>
            翼面積 <b>{(area * 10000).toFixed(0)} cm²</b>
          </span>
          <span>
            アスペクト比 <b>{((a.span * a.span) / area).toFixed(2)}</b>
          </span>
        </div>
        {field("incidence", "主翼取付角", -10, 15, "°", 1, 0.25)}
        <p className="hint">
          前縁が直線のテーパー翼。翼幅・翼弦・テーパー比は形状、翼面積、有限翼効果に連動します。
        </p>
      </Section>
      <Section title="翼型断面" index="02B" open>
        <label className="small-label airfoil-select">
          空力モデル
          <select
            aria-label="翼型モデル"
            value={a.airfoil_mode}
            onChange={(e) => A("airfoil_mode", e.target.value)}
          >
            <option value="naca4">NACA断面から推定（薄翼理論）</option>
            <option value="manual">空力係数を手入力</option>
          </select>
        </label>
        {a.airfoil_mode === "naca4" ? (
          <>
            <label className="small-label airfoil-select">
              翼型プリセット
              <select
                aria-label="翼型プリセット"
                value={
                  a.camber === 0 && a.thickness === 0.12
                    ? "0012"
                    : a.camber === 0.02 &&
                        a.camber_position === 0.4 &&
                        a.thickness === 0.12
                      ? "2412"
                      : a.camber === 0.04 &&
                          a.camber_position === 0.4 &&
                          a.thickness === 0.12
                        ? "4412"
                        : a.camber === 0.02 &&
                            a.camber_position === 0.4 &&
                            a.thickness === 0.15
                          ? "2415"
                          : "custom"
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "custom") return;
                  update({
                    ...config,
                    aircraft: {
                      ...a,
                      camber: Number(v[0]) / 100,
                      camber_position: v[0] === "0" ? 0.4 : Number(v[1]) / 10,
                      thickness: Number(v.slice(2)) / 100,
                    },
                  });
                }}
              >
                <option value="0012">NACA 0012（対称翼）</option>
                <option value="2412">NACA 2412</option>
                <option value="4412">NACA 4412</option>
                <option value="2415">NACA 2415</option>
                <option value="custom" disabled>
                  カスタム形状
                </option>
              </select>
            </label>
            {field("camber", "最大キャンバー", 0, 6, "% c", 100, 0.1)}
            {field(
              "camber_position",
              "最大キャンバー位置",
              10,
              80,
              "% c",
              100,
              1,
            )}
            {field("thickness", "最大翼厚比", 4, 24, "% c", 100, 0.5)}
            <div className="airfoil-derived">
              <span>
                α₀ <b>{geometry(a).effective.zeroLift.toFixed(2)}°</b>
              </span>
              <span>
                Cm₀ <b>{geometry(a).effective.cm0.toFixed(4)}</b>
              </span>
            </div>
            <p className="airfoil-hint">
              キャンバー線から零揚力角・Cm₀を推定します。翼厚は形状に反映。粘性抗力・失速特性への影響は未計算です。CD₀・CLmaxは詳細設定で仮定します。
            </p>
          </>
        ) : (
          <>
            {field("zero_lift", "零揚力角", -8, 5, "°", 1, 0.1)}
            {field("cm0", "主翼 Cm₀", -0.3, 0.3, "", 1, 0.005)}
            <p className="airfoil-hint">
              以前の設計はこのモードで復元します。翼型形状は未指定として模式表示します。
            </p>
          </>
        )}
        <p className="airfoil-hint">
          <a
            className="airfoil-link"
            href="https://foil.tools/kulfan-canvas"
            target="_blank"
            rel="noreferrer"
          >
            参照：Foil.tools の翼型編集
          </a>
        </p>
      </Section>
      <Section title="水平尾翼" index="03">
        {field("tail_area", "尾翼面積", 10, 10000, "cm²", 10000, 5)}
        {field("tail_span", "尾翼翼幅", 50, 3000, "mm", 1000, 10)}
        {field("tail_arm", "主翼AC–尾翼AC", 50, 3000, "mm", 1000, 5)}
        {field("tail_incidence", "尾翼取付角", -15, 15, "°", 1, 0.1)}
        {field("elevator", "昇降舵角", -25, 25, "°", 1, 0.5)}
        {field("tail_efficiency", "尾翼効率", 0.1, 1, "", 1, 0.05)}
        <p className="hint">
          昇降舵は後縁下げが正。吹き下ろしとピッチ運動による尾翼迎角を計算します。
        </p>
      </Section>
      {a.kind === "powered" && (
        <Section title="推進装置" index="04" open>
          <label className="small-label">
            推力モデル
            <select
              aria-label="推力モデル"
              value={a.thrust_mode}
              onChange={(e) => A("thrust_mode", e.target.value)}
            >
              <option value="curve">速度別推力曲線</option>
              <option value="fixed">固定推力（簡易）</option>
            </select>
          </label>
          {field("throttle", "スロットル", 0, 100, "%", 100, 1)}
          {a.thrust_mode === "fixed" ? (
            field("thrust", "全開推力", 0, 100, "N", 1, 0.1)
          ) : (
            <CurveEditor
              value={a.thrust_curve}
              onChange={(v) => A("thrust_curve", v)}
            />
          )}{" "}
          {field("thrust_z", "推力軸のCG下方距離", -1000, 1000, "mm", 1000, 1)}
          {field("thrust_angle", "推力上向き角", -30, 30, "°", 1, 0.5)}
          <p className="hint">
            バッテリー重量は総重量または部品に含めてください。消耗による推力低下は未実装です。
          </p>
        </Section>
      )}
      <Section title="飛行条件" index="05" open>
        {(
          [
            "speed",
            "height",
            "launch_angle",
            "pitch",
            "pitch_rate",
            "wind",
            "density",
            "temperature",
          ] as const
        ).map((key, i) => {
          const specs = [
            ["初速度（対地）", 0.5, 50, "m/s", 0.5],
            ["初期高度", 0.05, 500, "m", 0.1],
            ["投射角度", -45, 60, "°", 0.5],
            ["初期ピッチ角", -45, 60, "°", 0.5],
            ["初期ピッチ角速度", -90, 90, "°/s", 1],
            ["風速（追い風＋）", -20, 20, "m/s", 0.5],
            ["空気密度", 0.3, 1.5, "kg/m³", 0.025],
            ["気温", -30, 50, "°C", 1],
          ][i];
          return (
            <Field
              key={key}
              label={specs[0] as string}
              value={c[key]}
              min={specs[1] as number}
              max={specs[2] as number}
              unit={specs[3] as string}
              step={specs[4] as number}
              onChange={(v) => C(key, v)}
            />
          );
        })}
      </Section>
      <Section title="空力モデル・計算設定" index="06">
        {field("cd0", "主翼 CD₀", 0, 0.2, "", 1, 0.001)}
        {field("body_cda", "胴体 Cd×面積", 0, 0.1, "m²", 1, 0.0001, false)}
        {field("oswald", "Oswald 効率", 0.3, 1, "", 1, 0.01)}
        {field("cl_max", "仮定 CLmax", 0.2, 2, "", 1, 0.05)}
        {(["duration", "sample_dt", "max_step", "rtol", "atol"] as const).map(
          (key, i) => {
            const specs = [
              ["計算時間", 0.1, 120, "s", 0.5],
              ["出力間隔", 0.02, 1, "s", 0.01],
              ["最大積分刻み", 0.001, 0.1, "s", 0.001],
              ["相対許容誤差", 1e-10, 0.001, "", 1e-8],
              ["絶対許容誤差", 1e-12, 0.0001, "", 1e-10],
            ][i];
            return (
              <Field
                key={key}
                label={specs[0] as string}
                value={s[key]}
                min={specs[1] as number}
                max={specs[2] as number}
                unit={specs[3] as string}
                step={specs[4] as number}
                slider={false}
                onChange={(v) => S(key, v)}
              />
            );
          },
        )}
      </Section>
      <div className="sidebar-foot">
        <FlaskConical size={13} />
        <span>SI単位系 · 縦方向 3DoF · RK45</span>
      </div>
    </aside>
  );
}

export default function App() {
  const [presets, setPresets] = useState<(Config & { id: string })[]>([]),
    [config, setConfig] = useState<Config | null>(null);
  const [result, setResult] = useState<Result | null>(null),
    [resultKey, setResultKey] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [auto, setAuto] = useState(true),
    [runId, setRunId] = useState(0);
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState("speed"),
    [saved, setSaved] = useState<Saved[]>([]),
    [visible, setVisible] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const configKey = JSON.stringify(config),
    dirty = configKey !== resultKey;
  useEffect(() => {
    fetch("/api/presets")
      .then((r) => {
        if (!r.ok) throw Error("APIに接続できません。");
        return r.json();
      })
      .then((p) => {
        setPresets(p);
        setConfig({
          aircraft: p[0].aircraft,
          conditions: p[0].conditions,
          solver: p[0].solver,
        });
      })
      .catch((e) => setError(e.message));
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      if (!Array.isArray(data)) throw Error();
      setSaved(
        data
          .filter(
            (v: Saved) =>
              v.id &&
              v.config?.aircraft &&
              v.result?.rows?.length &&
              v.result?.summary &&
              v.result?.provenance,
          )
          .slice(0, 5),
      );
    } catch {
      setNotice(
        "保存データを読み込めませんでした。JSONファイルから復元できます。",
      );
    }
  }, []);
  useEffect(() => {
    if (!config || (!auto && runId === 0)) return;
    const controller = new AbortController();
    const current = ++requestId.current;
    const timer = setTimeout(
      () => {
        setBusy(true);
        setError("");
        calculate(config, controller.signal)
          .then((r) => {
            if (current !== requestId.current) return;
            setResult(r);
            setResultKey(JSON.stringify(config));
            setTime(0);
            setPlaying(false);
          })
          .catch((e) => {
            if (e.name !== "AbortError" && current === requestId.current)
              setError(e.message);
          })
          .finally(() => {
            if (current === requestId.current) setBusy(false);
          });
      },
      auto ? 350 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Manual mode runs only when runId changes; configuration edits invalidate prior results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto ? configKey : null, auto, runId]);
  useEffect(() => {
    if (!playing || !result) return;
    const id = window.setInterval(
      () =>
        setTime((t) => {
          const end = result.rows.at(-1)!.t;
          if (t + 0.04 * speed >= end) {
            setPlaying(false);
            return end;
          }
          return t + 0.04 * speed;
        }),
      40,
    );
    return () => clearInterval(id);
  }, [playing, speed, result]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  function update(c: Config) {
    setConfig(normalizeConfig(c));
    setPlaying(false);
    setError("");
  }
  function choose(c: Config) {
    update({
      aircraft: c.aircraft,
      conditions: c.conditions,
      solver: c.solver,
    });
    setNotice("プリセットを読み込みました。");
  }
  function persist(next: Saved[]) {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
      setSaved(next);
      return true;
    } catch {
      setError(
        "ブラウザの保存容量が不足しています。設計案を削除するかJSONを書き出してください。",
      );
      return false;
    }
  }
  function save() {
    if (!config || !result || dirty || busy) return;
    if (saved.length >= 5) {
      setError("保存は5案までです。不要な設計案を削除してください。");
      return;
    }
    const item: Saved = {
      id: crypto.randomUUID(),
      name: config.aircraft.name,
      config: clone(config),
      result: clone(result),
      color: COLORS[saved.length % COLORS.length],
    };
    if (persist([...saved, item])) {
      setVisible((v) => [...v, item.id]);
      setNotice("設計条件と計算結果をブラウザに保存しました。");
    }
  }
  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      if (f.size > 15 * 1024 * 1024)
        throw Error("15MB以下のJSONを指定してください。");
      const data = JSON.parse(await f.text());
      if (
        data.version !== 1 ||
        !data.config?.aircraft ||
        !data.config?.conditions ||
        !data.config?.solver
      )
        throw Error("AeroLab形式のJSON（version: 1）を指定してください。");
      const next: Config = normalizeConfig(data.config);
      await calculate(next);
      update(next);
      setRunId((n) => n + 1);
      setNotice("設計JSONを読み込みました。");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function exportJson() {
    if (!config) return;
    download(
      "aerolab-design.json",
      JSON.stringify(
        { version: 1, config, result: dirty ? null : result },
        null,
        2,
      ),
      "application/json",
    );
  }
  function exportCsv() {
    if (!result || dirty) return;
    const fields = Object.keys(result.rows[0]);
    download(
      "aerolab-flight.csv",
      "\uFEFF" +
        fields.join(",") +
        "\n" +
        result.rows.map((r) => fields.map((k) => r[k]).join(",")).join("\n"),
      "text/csv;charset=utf-8",
    );
  }
  const comparison = saved.filter((s) => visible.includes(s.id));
  const current = result?.rows.reduce(
    (best, r) => (Math.abs(r.t - time) < Math.abs(best.t - time) ? r : best),
    result.rows[0],
  );
  const s = result?.summary;
  const line = (
    rows: Result["rows"],
    key: string,
    name: string,
    color: string,
    dash?: string,
  ) => ({
    x: rows.map((r) => r.t),
    y: rows.map((r) => r[key]),
    name,
    type: "scatter",
    mode: "lines",
    line: { color, width: 1.8, dash },
    hovertemplate: "%{x:.2f} s · %{y:.2f}<extra>%{fullData.name}</extra>",
  });
  const trajectoryData = result
    ? [
        ...comparison.map((d) => ({
          x: d.result.rows.map((r) => r.x),
          y: d.result.rows.map((r) => r.h),
          customdata: d.result.rows.map((r) => r.t),
          name: d.name,
          type: "scatter",
          mode: "lines",
          line: { color: d.color, width: 2, dash: "dot" },
        })),
        {
          x: result.rows.map((r) => r.x),
          y: result.rows.map((r) => r.h),
          customdata: result.rows.map((r) => r.t),
          name: result.provenance.aircraft.name,
          type: "scatter",
          mode: "lines",
          line: { color: GREEN, width: 3 },
          fill: "tozeroy",
          fillcolor: "rgba(57,125,102,.045)",
          hovertemplate: "距離 %{x:.2f} m<br>高度 %{y:.2f} m<extra></extra>",
        },
        {
          x: [result.rows[0].x, result.rows.at(-1)!.x],
          y: [result.rows[0].h, result.rows.at(-1)!.h],
          customdata: [0, result.rows.at(-1)!.t],
          name: "開始 / 終了",
          type: "scatter",
          mode: "markers",
          marker: {
            size: 7,
            color: ["#397d66", "#8d9c94"],
            line: { color: "#fff", width: 2 },
          },
          showlegend: false,
        },
        {
          x: [current!.x],
          y: [current!.h],
          customdata: [current!.t],
          type: "scatter",
          mode: "markers",
          marker: {
            symbol: "triangle-right",
            angle: -current!.pitch,
            size: 17,
            color: GREEN,
            line: { color: "#fff", width: 2 },
          },
          showlegend: false,
          hoverinfo: "skip",
        },
      ]
    : [];
  function detailData() {
    if (!result) return [];
    const rows = result.rows;
    if (tab === "speed")
      return [
        line(rows, "airspeed", "対気速度", GREEN),
        line(rows, "groundspeed", "対地速度", BLUE, "dot"),
        {
          x: [0, rows.at(-1)!.t],
          y: [s!.stall_speed, s!.stall_speed],
          name: "推定失速速度",
          type: "scatter",
          mode: "lines",
          line: { color: ORANGE, width: 1, dash: "dash" },
        },
        ...comparison.map((d) =>
          line(d.result.rows, "airspeed", d.name, d.color),
        ),
      ];
    if (tab === "forces")
      return [
        line(rows, "lift", "主翼揚力", GREEN),
        line(rows, "tail_lift", "尾翼揚力", BLUE),
        line(rows, "drag", "抗力", ORANGE),
        line(rows, "thrust", "推力", "#9875b7"),
        line(rows, "weight", "重力", "#a3aba6", "dash"),
      ];
    if (tab === "attitude")
      return [
        line(rows, "pitch", "ピッチ角", GREEN),
        line(rows, "alpha", "迎角", BLUE),
        ...comparison.map((d) => line(d.result.rows, "pitch", d.name, d.color)),
      ];
    return [
      line(rows, "pitch_rate", "ピッチ角速度", GREEN),
      ...comparison.map((d) =>
        line(d.result.rows, "pitch_rate", d.name, d.color),
      ),
    ];
  }
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Plane size={21} />
          </span>
          <strong>
            AeroLab<span> / </span>
            <small>FLIGHT SIMULATOR</small>
          </strong>
        </a>
        <div className="top-right">
          <span className="model-tag">
            <span />
            縦方向 3DoF
          </span>
          <span className="version">SHAPE & FLIGHT / v0.2</span>
        </div>
      </header>
      <div className="workspace-title">
        <div>
          <div className="breadcrumb">
            ワークスペース <ChevronRight size={12} /> フライトシミュレーション
          </div>
          <h1>
            設計を、飛行へ。<span>Aircraft design & flight analysis</span>
          </h1>
        </div>
        <div className="title-actions">
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            onChange={importFile}
            hidden
          />
          <button className="btn" onClick={() => file.current?.click()}>
            <ArrowUpFromLine size={14} />
            読み込み
          </button>
          <button className="btn" disabled={!config} onClick={exportJson}>
            <ArrowDownToLine size={14} />
            JSON
          </button>
          <button
            className="btn primary"
            disabled={!result || dirty || busy}
            onClick={save}
          >
            <Save size={14} />
            設計を保存
          </button>
        </div>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={14} />
          {notice}
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <TriangleAlert size={16} />
          <span>{error}</span>
          <button onClick={() => setError("")}>閉じる</button>
        </div>
      )}
      <div className="workspace">
        {config ? (
          <Sidebar
            config={config}
            update={update}
            presets={presets}
            choose={choose}
          />
        ) : (
          <aside className="sidebar loading">設定を読み込み中…</aside>
        )}
        <main className="main">
          <div className="simulation-toolbar">
            <div className="panel-title">
              <Activity size={15} />
              <h2>フライト解析</h2>
              <span
                className={"status-dot " + (busy || dirty ? "pending" : "")}
              />
              <span className="subtle">
                {busy ? "計算中…" : dirty ? "設定変更あり" : "計算完了"}
              </span>
            </div>
            <div className="toolbar-actions">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => {
                    setAuto(e.target.checked);
                    if (!e.target.checked) setRunId(0);
                  }}
                />
                <span className="toggle" />
                自動計算
              </label>
              <button
                className="btn small"
                disabled={busy || !config}
                onClick={() => setRunId((n) => n + 1)}
              >
                <RotateCcw size={12} />
                計算実行
              </button>
            </div>
          </div>
          {config && <AircraftPreview aircraft={config.aircraft} />}
          <div className={"analysis-grid " + (dirty ? "stale" : "")}>
            <section className="trajectory panel">
              <div className="chart-heading">
                <div>
                  <span className="eyebrow">FLIGHT TRAJECTORY</span>
                  <h3>飛行軌道</h3>
                </div>
                <div className="chart-badges">
                  <span>
                    <span className="dot" />
                    現在の設計
                  </span>
                  <span className="tag">2D / 側面</span>
                </div>
              </div>
              <div className="trajectory-note">
                <Wind size={12} />
                <span>
                  風速 {fmt(result?.provenance.conditions.wind, 1)} m/s
                </span>
                <span className="divider" />
                高度と距離は軸ごとに拡大
              </div>
              {result ? (
                <Plot
                  height={365}
                  data={trajectoryData}
                  onTime={(t) => {
                    setTime(Math.max(0, Math.min(t, result.rows.at(-1)!.t)));
                    setPlaying(false);
                  }}
                  revision="trajectory"
                  layout={{
                    showlegend: comparison.length > 0,
                    margin: { l: 52, r: 25, t: 25, b: 45 },
                    xaxis: {
                      title: { text: "水平距離 (m)" },
                      gridcolor: "#e5eae4",
                      zeroline: false,
                    },
                    yaxis: {
                      title: { text: "高度 (m)" },
                      gridcolor: "#e5eae4",
                      zeroline: false,
                      rangemode: "tozero",
                    },
                  }}
                />
              ) : (
                <div className="chart-loading">
                  <Activity size={28} />
                  <span>物理エンジンの計算結果を読み込み中…</span>
                </div>
              )}
              <div className="playback">
                <button
                  className="play-button"
                  aria-label={playing ? "一時停止" : "再生"}
                  disabled={!result || dirty}
                  onClick={() => {
                    if (time >= result!.rows.at(-1)!.t) setTime(0);
                    setPlaying((v) => !v);
                  }}
                >
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <span className="time-display">
                  {fmt(time)}
                  <small> / {fmt(result?.rows.at(-1)?.t)} s</small>
                </span>
                <input
                  type="range"
                  aria-label="再生時刻"
                  min={0}
                  max={result?.rows.at(-1)?.t || 1}
                  step={0.01}
                  value={time}
                  onChange={(e) => {
                    setTime(Number(e.target.value));
                    setPlaying(false);
                  }}
                />
                <select
                  aria-label="再生速度"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={4}>4×</option>
                </select>
              </div>
              <div className="telemetry">
                {[
                  ["高度", current?.h, "m"],
                  ["対気速度", current?.airspeed, "m/s"],
                  ["ピッチ角", current?.pitch, "°"],
                  ["迎角", current?.alpha, "°"],
                ].map(([label, v, unit]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>
                      {fmt(v as number, 1)}
                      <small>{unit}</small>
                    </strong>
                  </div>
                ))}
              </div>
              <div className="instant-forces">
                t = {fmt(current?.t)} s
                <span>主翼揚力 {fmt(current?.lift)} N</span>
                <span>抗力 {fmt(current?.drag)} N</span>
                <span>推力 {fmt(current?.thrust)} N</span>
              </div>
            </section>
            <aside className="results panel">
              <div className="chart-heading">
                <div>
                  <span className="eyebrow">PERFORMANCE</span>
                  <h3>解析結果</h3>
                </div>
                <span className="tag">予測値</span>
              </div>
              <div className="result-state">
                <span className="status-dot" />
                {result ? statusName(result.status) : "計算待ち"}
              </div>
              <div className="primary-metric">
                <span>
                  {result?.status === "ground"
                    ? "接地までの水平距離"
                    : "終了時の水平変位"}
                </span>
                <strong>
                  {fmt(s?.distance, 1)}
                  <small>m</small>
                </strong>
              </div>
              <div className="metric-grid">
                {[
                  ["飛行時間", s?.flight_time, "s"],
                  ["最高高度", s?.max_height, "m"],
                  ["最高対気速度", s?.max_speed, "m/s"],
                  ["最低対気速度", s?.min_speed, "m/s"],
                ].map(([label, v, unit]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>
                      {fmt(v as number, 1)}
                      <small>{unit}</small>
                    </strong>
                  </div>
                ))}
              </div>
              <div className="stability">
                <div>
                  <span>静安定余裕</span>
                  <strong>
                    {s ? fmt(s.static_margin * 100, 1) : "—"}
                    <small>% MAC</small>
                  </strong>
                </div>
                <div className="stability-bar">
                  <span
                    style={{
                      width: `${Math.max(0, Math.min(100, (s?.static_margin || 0) * 400))}%`,
                    }}
                  />
                </div>
                <p>
                  {s && s.static_margin <= 0
                    ? "負の静安定余裕：縦静安定性を再検討してください。"
                    : "主翼・尾翼・吹き下ろしを含む線形近似。"}
                </p>
                <p>トリム・動安定性は未評価です。</p>
              </div>
              <div className="result-derived">
                <span>
                  翼面荷重<b>{s ? fmt(s.mass / s.area, 2) : "—"} kg/m²</b>
                </span>
                <span>
                  参考失速速度<b>{fmt(s?.stall_speed, 2)} m/s</b>
                </span>
                <span>
                  重心位置<b>{s ? fmt(s.cg_mac * 100, 1) : "—"} % MAC</b>
                </span>
                <span>
                  Iyy<b>{fmt(s?.iyy, 5)} kg·m²</b>
                </span>
                {result?.landing && (
                  <span>
                    接地時の対地速度<b>{fmt(result.landing.speed, 2)} m/s</b>
                  </span>
                )}
              </div>
            </aside>
            <section className="detail panel">
              <div className="detail-header">
                <div className="tabs">
                  {[
                    ["speed", "速度"],
                    ["forces", "空気力"],
                    ["attitude", "姿勢・迎角"],
                    ["rate", "ピッチ角速度"],
                  ].map(([id, name]) => (
                    <button
                      key={id}
                      className={tab === id ? "active" : ""}
                      onClick={() => setTab(id)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <button
                  className="text-button"
                  disabled={!result || dirty}
                  onClick={exportCsv}
                >
                  <ArrowDownToLine size={13} />
                  CSV
                </button>
              </div>
              {result && (
                <Plot
                  height={235}
                  data={detailData()}
                  onTime={(t) => {
                    setTime(Math.max(0, Math.min(t, result.rows.at(-1)!.t)));
                    setPlaying(false);
                  }}
                  revision={tab}
                  layout={{
                    margin: { l: 50, r: 20, t: 35, b: 42 },
                    yaxis: {
                      title: {
                        text:
                          tab === "speed"
                            ? "速度 (m/s)"
                            : tab === "forces"
                              ? "力 (N)"
                              : tab === "rate"
                                ? "角速度 (°/s)"
                                : "角度 (°)",
                      },
                      gridcolor: "#e8ece7",
                      zeroline: false,
                    },
                    shapes: [
                      {
                        type: "line",
                        x0: time,
                        x1: time,
                        y0: 0,
                        y1: 1,
                        yref: "paper",
                        line: { color: "#abb7ac", width: 1, dash: "dot" },
                      },
                    ],
                  }}
                />
              )}
              <div className="chart-footnote">
                {tab === "forces"
                  ? "各力の方向は異なります。値の大小だけでは飛行可否を判断できません。"
                  : "グラフの点をクリックすると、軌道・再生時刻が連動します。ドラッグで拡大、ダブルクリックでリセット。"}
              </div>
            </section>
          </div>
          <section className="comparison panel">
            <div className="comparison-header">
              <div className="panel-title">
                <Layers size={16} />
                <h2>設計案を比較</h2>
                <span className="count">{saved.length} / 5</span>
              </div>
              <button
                className="text-button"
                disabled={!result || dirty || busy}
                onClick={save}
              >
                <Plus size={14} />
                現在の設計を追加
              </button>
            </div>
            {saved.length === 0 ? (
              <div className="comparison-empty">
                <Copy size={22} />
                <div>
                  <strong>設計の違いを、同じ軌道で。</strong>
                  <p>
                    現在の設計を保存して、重量や重心を変更した結果を比較できます。
                  </p>
                </div>
              </div>
            ) : (
              <div className="saved-list">
                {saved.map((d) => (
                  <div className="saved-row" key={d.id}>
                    <label>
                      <input
                        aria-label={`${d.name} を重ねて表示`}
                        type="checkbox"
                        checked={visible.includes(d.id)}
                        onChange={(e) =>
                          setVisible((v) =>
                            e.target.checked
                              ? [...v, d.id]
                              : v.filter((i) => i !== d.id),
                          )
                        }
                      />
                      <span className="dot" style={{ background: d.color }} />
                      <b>{d.name}</b>
                    </label>
                    <span>{fmt(d.result.summary.mass * 1000, 0)} g</span>
                    <span>CG {fmt(d.result.summary.cg_mac * 100, 1)}%</span>
                    <span>
                      {fmt(d.result.summary.distance, 1)} m{" "}
                      <small>({statusName(d.result.status)})</small>
                    </span>
                    <button
                      className="text-button"
                      onClick={() => {
                        choose(clone(d.config));
                        setRunId((n) => n + 1);
                      }}
                    >
                      読込
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${d.name} を削除`}
                      onClick={() => {
                        if (persist(saved.filter((s) => s.id !== d.id)))
                          setVisible((v) => v.filter((id) => id !== d.id));
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="model-notes">
            <TriangleAlert size={16} />
            <div>
              <h3>モデルの適用範囲</h3>
              {result?.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
              <p>
                ロール・ヨー・横滑り、地面効果、構造変形は対象外です。静安定余裕だけで飛行可否を判定しません。
              </p>
            </div>
            <span className="tag">ENGINEERING APPROXIMATION</span>
          </section>
          <footer className="footer">
            <span className="footer-links">
              <span>AEROLAB</span>
              <a href="/api/readme" target="_blank" rel="noreferrer">
                起動・モデル説明
              </a>
              <a href="/api/source.zip" download>
                ソースZIP
              </a>
            </span>
            <span>
              {result?.provenance.model || "phase1-3dof"} ·
              サンプルは実在機体の性能を保証しません
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
