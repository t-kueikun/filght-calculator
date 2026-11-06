import { useEffect, useRef } from "react";
// Plotly's compact distribution keeps all charts local; no CDN runtime dependency.
// @ts-expect-error The distribution has no TypeScript declaration.
import Plotly from "plotly.js-basic-dist-min";
type Props = {
  data: unknown[];
  layout?: Record<string, unknown>;
  height: number;
  onTime?: (t: number) => void;
  revision?: string;
};
export function Plot({
  data,
  layout = {},
  height,
  onTime,
  revision = "chart",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onTime);
  callback.current = onTime;
  useEffect(() => {
    const el = ref.current!;
    let alive = true;
    Plotly.react(
      el,
      data,
      {
        height,
        autosize: true,
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: {
          family: 'Inter, "Noto Sans JP", system-ui, sans-serif',
          color: "#7c8681",
          size: 10,
        },
        margin: { l: 48, r: 18, t: 20, b: 40 },
        hovermode: "closest",
        showlegend: true,
        legend: { orientation: "h", x: 0, y: 1.16, font: { size: 10 } },
        xaxis: {
          gridcolor: "#e8ece7",
          zeroline: false,
          title: { text: "時間 (s)", standoff: 12 },
        },
        yaxis: { gridcolor: "#e8ece7", zeroline: false },
        uirevision: revision,
        ...layout,
      },
      {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["select2d", "lasso2d"],
        toImageButtonOptions: { format: "png", scale: 2 },
      },
    ).then(() => {
      if (!alive) return;
      // Plotly react keeps listeners; replace the click handler to avoid duplicates.
      const graph = el as HTMLDivElement & {
        removeAllListeners: (event: string) => void;
        on: (
          event: string,
          cb: (e: { points: { customdata?: number; x: number }[] }) => void,
        ) => void;
      };
      graph.removeAllListeners("plotly_click");
      graph.on("plotly_click", (e) => {
        const p = e.points?.[0];
        if (p) callback.current?.(p.customdata ?? p.x);
      });
    });
    const observer = new ResizeObserver(() => {
      if (alive) Plotly.Plots.resize(el);
    });
    observer.observe(el);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [data, layout, height, revision]);
  useEffect(
    () => () => {
      if (ref.current) Plotly.purge(ref.current);
    },
    [],
  );
  return <div ref={ref} className="plot" style={{ height }} />;
}
