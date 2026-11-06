import { test, expect } from "@playwright/test";

async function ready(page: import("@playwright/test").Page) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/simulate") && r.ok(),
  );
  await page.goto("/");
  const result = await (await response).json();
  await expect(
    page.getByRole("button", { name: "設計を保存", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("aircraft-svg")).toBeVisible();
  return result;
}

test("shape and CG change immediately even with automatic flight calculation disabled", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("自動計算").uncheck();
  await page.getByRole("button", { name: "上面", exact: true }).click();
  const wing = page.locator("[data-part=wing]").first();
  const before = await wing.getAttribute("d");
  await page
    .getByRole("spinbutton", { name: "翼幅", exact: true })
    .fill("1400");
  await page.getByRole("spinbutton", { name: "翼幅", exact: true }).blur();
  await expect(page.getByTestId("preview-span")).toContainText("1400");
  await expect(wing).not.toHaveAttribute("d", before!);
  await expect(
    page.getByRole("button", { name: "設計を保存", exact: true }),
  ).toBeDisabled();
  const oldCG = await page.getByTestId("cg-marker").getAttribute("transform");
  await page
    .getByRole("spinbutton", { name: "重心位置", exact: true })
    .fill("40");
  await page.getByRole("spinbutton", { name: "重心位置", exact: true }).blur();
  await expect(page.getByTestId("preview-cg")).toContainText("40.0");
  await expect(page.getByTestId("cg-marker")).not.toHaveAttribute(
    "transform",
    oldCG!,
  );
});

test("NACA camber changes the actual engine coefficients and trajectory", async ({
  page,
}) => {
  const original = await ready(page);
  await page
    .locator(".aircraft-preview")
    .screenshot({ path: "../../screenshots/shape-preview.png" });
  await page.getByRole("button", { name: "翼型を編集", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "最大キャンバー", exact: true }),
  ).toBeInViewport();
  const outline = await page.getByTestId("foil-outline").getAttribute("d");
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/simulate") && r.ok(),
  );
  await page.getByLabel("翼型プリセット").selectOption("4412");
  const changed = await (await response).json();
  expect(changed.summary.distance).not.toBe(original.summary.distance);
  expect(changed.summary.cm0).toBeCloseTo(2 * original.summary.cm0, 8);
  await expect(page.getByTestId("foil-name")).toHaveText("NACA 4412");
  await expect(page.getByTestId("foil-outline")).not.toHaveAttribute(
    "d",
    outline!,
  );
  await expect(page.getByTestId("effective-alpha")).toContainText(
    changed.summary.zero_lift.toFixed(2),
  );
  await expect(page.getByTestId("effective-cm")).toContainText(
    changed.summary.cm0.toFixed(4),
  );
  const beforeThickness = await page
    .getByTestId("foil-outline")
    .getAttribute("d");
  const thicknessResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/simulate") && r.ok(),
  );
  await page
    .getByRole("spinbutton", { name: "最大翼厚比", exact: true })
    .fill("18");
  await page
    .getByRole("spinbutton", { name: "最大翼厚比", exact: true })
    .blur();
  const thickness = await (await thicknessResponse).json();
  await expect(page.getByTestId("foil-outline")).not.toHaveAttribute(
    "d",
    beforeThickness!,
  );
  expect(thickness.summary.distance).toBeCloseTo(changed.summary.distance, 8);
  expect(thickness.provenance.airfoil.thickness_aero_effect).toBe(false);
  await expect(page.locator(".foil-preview .preview-caveat")).toContainText(
    "未計算",
  );
});

test("3D rotation, side view, elevator movement and airfoil DAT export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  const mesh = page.locator("[data-part=wing]").first();
  const original = await mesh.getAttribute("d");
  await page.getByTestId("aircraft-svg").focus();
  await page.keyboard.press("ArrowRight");
  await expect(mesh).not.toHaveAttribute("d", original!);
  await page.getByRole("button", { name: "側面", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "機体形状 側面図" }),
  ).toBeVisible();
  const elevator = page.locator("[data-part=elevator]").first(),
    before = await elevator.getAttribute("d");
  await page.locator("summary").filter({ hasText: "水平尾翼" }).click();
  await page
    .getByRole("spinbutton", { name: "昇降舵角", exact: true })
    .fill("15");
  await page.getByRole("spinbutton", { name: "昇降舵角", exact: true }).blur();
  await expect(elevator).not.toHaveAttribute("d", before!);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "DAT", exact: true }).click();
  const stream = await (await downloaded).createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk.toString();
  expect(text).toContain("NACA 2412");
  const coordinates = text
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(/\s+/).map(Number));
  expect(coordinates.length).toBe(201);
  expect(
    coordinates.every((p) => p.length === 2 && p.every(Number.isFinite)),
  ).toBeTruthy();
  expect(coordinates[0][0]).toBeCloseTo(1, 8);
  expect(coordinates.at(-1)![0]).toBeCloseTo(1, 8);
  expect(errors).toEqual([]);
});

test("legacy JSON keeps manual coefficients and labels unspecified geometry", async ({
  page,
}) => {
  const result = await ready(page);
  const old = {
    aircraft: result.provenance.aircraft,
    conditions: result.provenance.conditions,
    solver: result.provenance.solver,
  };
  for (const key of ["airfoil_mode", "camber", "camber_position", "thickness"])
    delete old.aircraft[key];
  old.aircraft.zero_lift = -1.5;
  old.aircraft.cm0 = -0.025;
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "old.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: 1, config: old })),
    });
  await expect(page.getByLabel("翼型モデル")).toHaveValue("manual");
  await expect(page.getByTestId("foil-name")).toHaveText("翼型未指定");
  await expect(page.getByTestId("effective-alpha")).toContainText("-1.50");
  await expect(page.getByTestId("effective-cm")).toContainText("-0.0250");
  await expect(
    page.getByRole("button", { name: "DAT", exact: true }),
  ).toBeDisabled();
});
