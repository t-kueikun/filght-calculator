import { test, expect } from "@playwright/test";

async function ready(page: import("@playwright/test").Page) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/simulate") && r.ok(),
  );
  await page.goto("/");
  const body = await (await response).json();
  await expect(
    page.getByRole("button", { name: "設計を保存", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".js-plotly-plot")).toHaveCount(2);
  return body;
}

test("real simulation, weight changes, save, overlay and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const original = await ready(page);
  expect(original.status).toBe("ground");
  await page.getByRole("button", { name: "設計を保存", exact: true }).click();
  await expect(page.locator(".saved-row")).toHaveCount(1);
  const nextResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/simulate") && r.ok(),
  );
  await page
    .getByRole("spinbutton", { name: "総重量", exact: true })
    .fill("420");
  await page.getByRole("spinbutton", { name: "総重量", exact: true }).blur();
  const next = await (await nextResponse).json();
  expect(next.summary.distance).not.toBe(original.summary.distance);
  expect(next.summary.stall_speed).toBeGreaterThan(
    original.summary.stall_speed,
  );
  await expect(
    page.getByRole("button", { name: "設計を保存", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "設計を保存", exact: true }).click();
  await expect(page.locator(".saved-row")).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator(".trajectory .js-plotly-plot")
        .evaluate((el: any) => el.data.length),
    )
    .toBe(5);
  await page.reload();
  await expect(page.locator(".saved-row")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "設計を保存", exact: true }),
  ).toBeEnabled();
  await page
    .locator(".saved-row")
    .last()
    .getByRole("button", { name: "読込", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "総重量", exact: true }),
  ).toHaveValue("420");
  await expect(
    page.getByRole("button", { name: "設計を保存", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("powered preset, playback, linked graphs and CSV export", async ({
  page,
}) => {
  await ready(page);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/simulate") && r.ok(),
  );
  await page.getByLabel("サンプル機体").selectOption("powered");
  const motor = await (await response).json();
  expect(motor.rows.some((r: any) => r.thrust > 0)).toBeTruthy();
  await expect(page.getByLabel("推力モデル")).toHaveValue("curve");
  await page.getByRole("button", { name: "再生", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "一時停止", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByLabel("再生時刻").inputValue()))
    .toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.getByLabel("再生時刻").fill("3");
  await expect(page.locator(".time-display")).toContainText("3.00");
  await page.getByRole("button", { name: "姿勢・迎角", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".detail .js-plotly-plot")
        .evaluate((el: any) => el.data[0].name),
    )
    .toBe("ピッチ角");
  await page.getByRole("button", { name: "ピッチ角速度", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".detail .js-plotly-plot")
        .evaluate((el: any) => el.data[0].name),
    )
    .toBe("ピッチ角速度");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("aerolab-flight.csv");
  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream!) content += chunk.toString();
  expect(content).toContain("t,x,h,u,w,pitch,pitch_rate");
  expect(content.split("\n").length).toBe(motor.rows.length + 1);
});

test("manual run prevents automatic requests and handles JSON import errors", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("自動計算").uncheck();
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/simulate")) calls++;
  });
  await page
    .getByRole("spinbutton", { name: "翼幅", exact: true })
    .fill("1100");
  await page.getByRole("spinbutton", { name: "翼幅", exact: true }).blur();
  await expect(
    page.getByRole("button", { name: "設計を保存", exact: true }),
  ).toBeDisabled();
  await page.waitForTimeout(600);
  expect(calls).toBe(0);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/simulate") && r.ok(),
  );
  await page.getByRole("button", { name: "計算実行", exact: true }).click();
  expect((await (await response).json()).summary.area).toBeCloseTo(0.198);
  await expect(
    page.getByRole("button", { name: "設計を保存", exact: true }),
  ).toBeEnabled();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{}"),
    });
  await expect(page.getByRole("alert")).toContainText("AeroLab形式");
});

test("JSON round trip and components mode compute actual mass properties", async ({
  page,
}) => {
  await ready(page);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const stream = await (await downloaded).createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk.toString();
  const backup = JSON.parse(text);
  expect(backup.version).toBe(1);
  expect(backup.result.rows.length).toBeGreaterThan(5);
  backup.config.aircraft.name = "インポート確認";
  backup.config.aircraft.mass = 0.44;
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "design.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await expect(page.getByLabel("機体名", { exact: true })).toHaveValue(
    "インポート確認",
  );
  await expect(
    page.getByRole("button", { name: "設計を保存", exact: true }),
  ).toBeEnabled();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/simulate") && r.ok(),
  );
  await page.getByRole("button", { name: "部品から算出", exact: true }).click();
  const result = await (await response).json();
  expect(result.summary.mass).toBeCloseTo(0.32);
  await expect(page.getByLabel("部品1 名称")).toHaveValue("主翼");
});

test("desktop and mobile render without horizontal overflow", async ({
  page,
}) => {
  await ready(page);
  await page.screenshot({
    path: "../../screenshots/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBeTruthy();
  await page.screenshot({
    path: "../../screenshots/mobile.png",
    fullPage: true,
  });
});
