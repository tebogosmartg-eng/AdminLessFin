/**
 * The statements as an accountant reads them.
 *
 * Runs in whichever company and financial year are active — nothing here
 * switches context. Every assertion is made in the browser: the columns read
 * current year then comparative on every statement, each note number opens
 * the note printed with that number, the note leads back to its statement,
 * a refresh changes nothing, and the note numbers in the downloaded PDF are
 * links that land on the notes they name.
 */
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';

async function openDocument(page: Page) {
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  const nav = page.getByRole('navigation', { name: /document structure/i });
  await expect(nav).toBeVisible({ timeout: 180_000 });
  return nav;
}

type Ref = { number: string | null; id: string | null; line: string | undefined };

async function noteRefs(page: Page): Promise<Ref[]> {
  return page.locator('[data-testid="afs-note-ref"]').evaluateAll((els) =>
    els.map((el) => ({
      number: el.getAttribute('data-note-number'),
      id: el.getAttribute('data-note-id'),
      line: el.closest('tr')?.querySelector('td')?.textContent?.trim(),
    })),
  );
}

/** Pages of a PDF with their text runs and their internal links. */
function readPdf(pdf: string) {
  const objects = new Map<number, string>();
  for (const m of pdf.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)) objects.set(Number(m[1]), m[2]);
  const kids = /\/Kids \[ ([^\]]+) \]/.exec(objects.get(2)!)![1].match(/\d+(?= 0 R)/g)!.map(Number);
  return kids.map((pageId) => {
    const body = objects.get(pageId)!;
    const content = objects.get(Number(/\/Contents (\d+) 0 R/.exec(body)![1]))!;
    const texts = [...content.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm \(((?:[^()\\]|\\.)*)\) Tj/g)].map((t) => ({
      x: Number(t[1]),
      y: Number(t[2]),
      text: t[3],
    }));
    const annots = (/\/Annots \[([^\]]*)\]/.exec(body)?.[1].match(/\d+(?= 0 R)/g) || []).map(Number);
    const links = annots.map((id) => {
      const a = objects.get(id)!;
      return {
        rect: /\/Rect \[([^\]]+)\]/.exec(a)![1].split(' ').map(Number),
        dest: Number(/\/Dest \[(\d+) 0 R/.exec(a)![1]),
      };
    });
    return { pageId, texts, links };
  });
}

test.describe.configure({ mode: 'serial' });

test('statements read current year first, and every note reference opens its note', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  await waitForRouteSettled(page);
  const nav = await openDocument(page);

  const statements = nav.getByRole('button', { name: /^Statement of/ });
  const count = await statements.count();
  expect(count).toBeGreaterThanOrEqual(4);

  let checked = 0;
  const firstRefs: Record<string, Ref[]> = {};
  for (let i = 0; i < count; i++) {
    const button = statements.nth(i);
    const label = await button.innerText();
    await button.click();
    await expect(page.getByTestId('afs-statement')).toBeVisible();

    // Current year, then the comparative: 2026 then 2025, never the reverse.
    const current = (await page.getByTestId('afs-col-current').innerText()).match(/\d{4}/)?.[0];
    const comparativeCell = page.getByTestId('afs-col-comparative');
    if (await comparativeCell.count()) {
      const comparative = (await comparativeCell.innerText()).match(/\d{4}/)?.[0];
      expect(Number(current), `${label}: current year first`).toBe(Number(comparative) + 1);
    }

    const refs = await noteRefs(page);
    firstRefs[label] = refs;
    for (const ref of refs) {
      await page.locator(`[data-testid="afs-note-ref"][data-note-id="${ref.id}"]`).first().click();
      // The note that opens is the note printed with that number…
      await expect(page.getByTestId('afs-note-heading')).toContainText(`Note ${ref.number}.`);
      // …and the navigator agrees on its number.
      await expect(
        nav.locator(`[data-testid="afs-tree-note"][data-note-number="${ref.number}"]`),
      ).toHaveCount(1);
      // The note says where it is used, and leads back there.
      const from = page.getByTestId('afs-note-referenced-from');
      await from.getByTestId('afs-note-backlink').filter({ hasText: ref.line || '' }).first().click();
      await expect(page.getByTestId('afs-statement')).toBeVisible();
      checked += 1;
    }
  }
  console.log(`[evidence] ${checked} note reference(s) opened the note they name`);
  expect(checked).toBeGreaterThan(0);

  // A refresh leaves the statement and its references exactly as they were.
  await page.reload();
  await waitForRouteSettled(page);
  const again = await openDocument(page);
  const sfp = Object.keys(firstRefs).find((k) => /Financial Position/.test(k))!;
  await again.getByRole('button', { name: /^Statement of Financial Position/ }).click();
  await expect(page.getByTestId('afs-statement')).toBeVisible();
  expect(await noteRefs(page)).toEqual(firstRefs[sfp]);

  // The printed document: every note number is a link to its note.
  await page.getByRole('tab', { name: /live preview/i }).click();
  await expect(page.locator('iframe[title="Financial statement preview"]')).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: /generate pdf/i }).click(),
  ]);
  const pages = readPdf((await readFile((await download.path())!)).toString('latin1'));
  const byId = new Map(pages.map((p) => [p.pageId, p]));
  let links = 0;
  for (const p of pages) {
    for (const link of p.links) {
      const [x1, y1, x2, y2] = link.rect;
      const label = p.texts.find((t) => t.x >= x1 - 1 && t.x <= x2 && t.y >= y1 && t.y <= y2);
      if (!label || !/^\d+$/.test(label.text)) continue;
      const target = byId.get(link.dest)!;
      expect(target.texts.some((t) => t.text.startsWith(`Note ${label.text}. `))).toBe(true);
      links += 1;
    }
    // A statement page's column band reads Notes, current year, comparative.
    const band = p.texts.findIndex((t) => t.text === 'Notes');
    if (band >= 0 && /^\d{4}$/.test(p.texts[band + 1]?.text || '') && /^\d{4}$/.test(p.texts[band + 2]?.text || '')) {
      expect(Number(p.texts[band + 1].text)).toBe(Number(p.texts[band + 2].text) + 1);
    }
  }
  console.log(`[evidence] ${links} note link(s) in the PDF land on their notes`);
  expect(links).toBe(checked);

  await expectNoErrorBoundary(page);
});

/** A figure cell as a number: "2 540 000,00", "(640 000,00)", "–" or blank. */
function figure(text: string | null): number | null {
  const t = String(text ?? '').replace(/\u00a0/g, ' ').trim();
  if (!t) return null;
  if (/^[-–]$/.test(t)) return 0;
  const negative = /^\(.*\)$/.test(t);
  const value = Number(t.replace(/[()\s]/g, '').replace(',', '.'));
  return negative ? -value : value;
}

async function statementFigures(page: Page, code: string) {
  const row = page.locator(`[data-testid="afs-statement"] tr[data-line-code="${code}"]`);
  await expect(row).toHaveCount(1);
  return {
    current: figure(await row.locator('[data-col="current"]').textContent()),
    comparative: figure(await row.locator('[data-col="comparative"]').textContent()),
  };
}

test('the statements and notes tell one story, and unfilled lines do not print', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  await waitForRouteSettled(page);
  const nav = await openDocument(page);

  // Both years balance.
  await nav.getByRole('button', { name: /^Statement of Financial Position/ }).click();
  const assets = await statementFigures(page, 'sfp.total_assets');
  const claims = await statementFigures(page, 'sfp.total_liabilities_and_equity');
  const equity = await statementFigures(page, 'sfp.total_equity');
  expect(claims).toEqual(assets);
  console.log(`[evidence] assets ${JSON.stringify(assets)} = equity and liabilities ${JSON.stringify(claims)}`);

  // The equity the statement of changes closes on is the balance sheet equity.
  await nav.getByRole('button', { name: /^Statement of Changes in Equity/ }).click();
  expect(await statementFigures(page, 'eq.closing')).toEqual(equity);

  // The Validation panel finds no note that disagrees with its statement.
  await page.getByRole('tab', { name: /^validation$/i }).click();
  const findings = await page.getByTestId('afs-readiness-issue').allInnerTexts();
  expect(findings.filter((f) => /does not agree with the statements|does not balance|differs between statements/i.test(f))).toEqual([]);

  // A held-back line: not printed, printed when switched on, then put back.
  const pdf = async () => {
    await page.getByRole('tab', { name: /live preview/i }).click();
    await expect(page.locator('iframe[title="Financial statement preview"]')).toBeVisible({ timeout: 60_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: /generate pdf/i }).click(),
    ]);
    const text = (await readFile((await download.path())!)).toString('latin1');
    await page.getByRole('tab', { name: /^editor$/i }).click();
    return text;
  };
  const printedLabel = (label: string) =>
    `(${label.replace(/[\u2013\u2014]/g, '-').replace(/[()\\]/g, (c) => `\\${c}`)})`;

  const before = await pdf();
  expect(before, 'no placeholder prints by default').not.toMatch(/\(\[ ?-? ?\]\) Tj/);

  const notes = nav.getByTestId('afs-tree-note');
  const count = await notes.count();
  let held: { key: string; label: string } | null = null;
  for (let i = 0; i < count && !held; i++) {
    await notes.nth(i).click();
    // A held-back line whose wording prints nowhere else, so the PDF can say
    // unambiguously whether it is there.
    const candidates = page.locator('[data-testid="afs-line-item"][data-printed="false"]');
    for (let j = 0; j < (await candidates.count()) && !held; j++) {
      const item = candidates.nth(j);
      const label = ((await item.getAttribute('data-line-label')) || '').trim();
      if (!label) continue;
      if (before.includes(printedLabel(label))) continue;
      held = { key: (await item.getAttribute('data-line-key'))!, label };
      await item.getByTestId('afs-line-switch').click();
      await expect(page.locator(`[data-testid="afs-line-item"][data-line-key="${held.key}"]`)).toHaveAttribute(
        'data-printed',
        'true',
      );
    }
  }
  expect(held, 'a note with a line held back').not.toBeNull();
  try {
    const after = await pdf();
    expect(after).toContain(printedLabel(held!.label));
    console.log(`[evidence] "${held!.label}" held back by default, printed when switched on`);
  } finally {
    const line = page.locator(`[data-testid="afs-line-item"][data-line-key="${held!.key}"]`);
    await line.getByRole('button', { name: 'Default' }).click();
    await expect(line).toHaveAttribute('data-printed', 'false');
  }
  await expectNoErrorBoundary(page);
});
