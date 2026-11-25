// Editing a shop on its card (3.3a): the form for players, owners and mods,
// Edited markers, Show changes, leaving with unsaved changes, tap targets.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, expectNoProblems, pageAs, readDb, serverForFile } from './helpers.js';

const server = serverForFile();
const query = (sql, ...args) => { const db = readDb(server); try { return db.prepare(sql).get(...args); } finally { db.close(); } };
const lastRevision = () => query('SELECT * FROM revisions ORDER BY id DESC LIMIT 1');
const textbox = (form, name) => form.getByRole('textbox', { name, exact: true });
const announced = (page) => page.locator('[role="status"].visually-hidden');
let page, dialog, form, edit, original, firstId;

test('a player opens the form on a phone', async ({ browser }) => {
  page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto('/plot/corridors-1');
  dialog = page.locator('dialog');
  edit = dialog.getByRole('button', { name: 'Edit', exact: true });
  const h2 = await dialog.locator('h2').boundingBox();
  const eb = await edit.boundingBox();
  const xb = await dialog.getByRole('button', { name: 'Close' }).boundingBox();
  expect(eb.x > h2.x && eb.x + eb.width <= xb.x + 1 && Math.abs((eb.y + eb.height / 2) - (xb.y + xb.height / 2)) < 16,
    'Edit sits on the title row, left of Close').toBe(true);
  expect(eb.height, 'a 36px tap target').toBeGreaterThanOrEqual(36);

  await edit.click();
  form = dialog.getByRole('form', { name: 'Suggesting an edit' });
  await expect(form).toBeVisible();
  await expect(form.locator('#shop-edit-title')).toBeFocused();
  await expect(form.getByText('The owner or a moderator reviews it')).toBeVisible();
  await expect(dialog.locator('.plot-detail__meta'), 'card details hide').toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Force edit' })).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Suggest edit' })).toBeVisible();
  await expect(form.locator('input[value="skelajon"]'), 'Owner is read-only').toHaveCount(0);
  await expect(form.getByText('skelajon')).toBeVisible();
  await expect(form.getByLabel('Guild name')).toHaveCount(0);
});

test('Edited markers, undo, and nothing-changed', async () => {
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(form.getByRole('alert')).toContainText("haven't changed anything");
  const about = textbox(form, 'About');
  original = await about.inputValue();
  await about.fill(`${original}!`);
  await expect(form.getByRole('alert'), 'the error clears').toHaveCount(0);
  await about.fill(`${original}\nNow selling Hekawt stuff too.`);
  await expect(form.getByRole('button', { name: 'Undo changes to About' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Undo changes to Shop name' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Undo changes to About' }).click();
  await expect(about).toHaveValue(original);
  await expect(form.getByRole('button', { name: 'Undo changes to About' })).toHaveCount(0);
  const palette = textbox(form, 'Palette');
  await palette.fill(`${await palette.inputValue()}   `);
  await expect(form.getByRole('button', { name: 'Undo changes to Palette' }), 'trailing spaces are no change').toHaveCount(0);
});

test('tags found in your text; Enter in the tag search sends nothing', async () => {
  const keywords = textbox(form, 'Keywords');
  await keywords.fill(`${await keywords.inputValue()} Giveaway`);
  const chip = form.locator('.tag-editor__from-text button.tag-chip--add').filter({ hasText: 'Giveaway' });
  await chip.click();
  await expect(form.getByRole('button', { name: 'Remove Giveaway' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Undo changes to Tags' })).toBeVisible();
  const before = lastRevision()?.id ?? 0;
  await form.getByPlaceholder('Find a tag').fill('zzz');
  await form.getByPlaceholder('Find a tag').press('Enter');
  await page.waitForTimeout(300);
  expect(lastRevision()?.id ?? 0).toBe(before);
  await form.getByPlaceholder('Find a tag').fill('');
});

test('Show changes', async () => {
  const about = textbox(form, 'About');
  await about.fill(`${original.replace('for', 'for all your')}\nOpen weekends.`);
  await textbox(form, 'Shop name').fill('Slime Palace');
  await form.getByRole('button', { name: 'Show changes' }).click();
  const changes = form.locator('.shop-edit__changes');
  await expect(changes).toBeVisible();
  await expect(about, 'the fields are swapped out').toHaveCount(0);
  const back = form.getByRole('button', { name: 'Back to editing' });
  await expect(back, 'the same button, focus kept').toBeFocused();
  await expect(back).toHaveAttribute('aria-expanded', 'true');
  const aboutDiff = await changes.locator('.shop-edit__field', { hasText: 'About' }).locator('.diff-text').innerHTML();
  expect(aboutDiff).toContain('<ins><span class="visually-hidden">Added: </span>all your </ins>');
  expect(aboutDiff).not.toContain('<del>');
  expect(aboutDiff).toContain('\nOpen weekends.');
  await expect(changes.locator('.shop-edit__field', { hasText: 'Shop name' }).locator('.diff-text')).toHaveText('Added: Slime Palace');
  await expect(changes).toContainText('Added Giveaway');
  await expect(changes.locator('.shop-edit__label-row')).toHaveText(['Shop name', 'About', 'Keywords', 'Tags']);
  await expect(form.getByRole('button', { name: 'Suggest edit' })).toBeVisible();
  await back.click();
  await expect(about).toHaveValue(/all your/);
  await expect(textbox(form, 'Shop name')).toHaveValue('Slime Palace');
});

test('sending a suggestion', async () => {
  await form.getByRole('button', { name: 'Undo changes to Shop name' }).click();
  await textbox(form, 'About').fill(`${original}\nNow selling Hekawt stuff too.`);
  await form.getByLabel('What did you change?').fill('added sky stuff');
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(dialog.locator('.plot-detail__notice')).toContainText('Sent for review');
  await expect(dialog.locator('.plot-detail__meta')).toBeVisible();
  await expect(edit).toBeFocused();
  await expect(announced(page)).toHaveText('Edit sent for review.');
  const r = lastRevision();
  expect(r).toMatchObject({ status: 'pending', action: 'edit', summary: 'added sky stuff', direct: 0 });
  const proposed = JSON.parse(r.proposed);
  const base = JSON.parse(r.base);
  expect(proposed.owner).toBe('skelajon');
  expect(proposed.guild_color).toBe(base.guild_color);
  expect(proposed.tag_ids).toHaveLength(base.tag_ids.length + 1);
  expect(query("SELECT stock FROM shops WHERE plot_id = 'corridors-1' AND closed_at IS NULL").stock, 'the live shop is unchanged').toBe(base.stock);
  firstId = r.id;
});

test('a second suggestion replaces the first; withdraw', async () => {
  await edit.click();
  await textbox(form, 'Palette').fill('Spruce and stone');
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(dialog.locator('.plot-detail__notice')).toContainText('replaces');
  expect(query('SELECT status FROM revisions WHERE id = ?', firstId).status).toBe('withdrawn');
  const second = lastRevision().id;
  const pending = dialog.locator('.pending-edits');
  await pending.getByRole('button', { name: 'Show' }).click();
  await pending.getByRole('button', { name: 'Withdraw' }).click();
  await expect(dialog.locator('.plot-detail__notice')).toContainText('withdrawn');
  expect(query('SELECT status FROM revisions WHERE id = ?', second).status).toBe('withdrawn');
  await expect(edit).toBeFocused();
});

test('leaving with unsaved changes asks first', async () => {
  await edit.click();
  await textbox(form, 'Shop name').fill('Skel Shop');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form.getByText('Discard your changes?')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await form.getByRole('button', { name: 'Keep editing' }).click();
  await expect(textbox(form, 'Shop name')).toHaveValue('Skel Shop');

  await textbox(form, 'Shop name').press('Escape');
  await expect(dialog.getByText('Discard your unsaved edit?')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('dialog').open), 'Esc keeps the card open').toBe(true);
  const keep = dialog.locator('.plot-detail__notice').getByRole('button', { name: 'Keep editing' });
  await expect(keep).toBeFocused();
  await keep.click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog.getByText('Discard your unsaved edit?'), 'Close asks too').toBeVisible();
  await dialog.locator('.plot-detail__notice').getByRole('button', { name: 'Discard' }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/');

  await page.goto('/plot/corridors-1');
  await edit.click();
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.locator('.plot-detail__meta'), 'no changes: Cancel just closes').toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
});

test('tap targets in the form', async () => {
  await page.goto('/plot/corridors-1');
  await edit.click();
  await textbox(form, 'About').fill('x');
  const small = await form.locator('button').evaluateAll((els) => els
    .filter((e) => e.offsetParent && !e.closest('.tag-picker__sections') && !e.closest('.tag-chips'))
    .map((e) => ({ t: e.textContent.trim() || e.getAttribute('aria-label'), h: e.getBoundingClientRect().height }))
    .filter((b) => b.h < 24));
  expect(small, 'no button under 24px').toEqual([]);
  const actions = await form.locator('.shop-edit__actions button, .shop-edit__reset').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(actions.every((h) => h >= 36), `action and undo buttons are 36px: ${actions}`).toBe(true);
  await expectNoProblems(page);
  await page.context().close();
});

test('logged out: Edit asks you to link your account', async ({ browser }) => {
  const visitor = await pageAs(browser, server, null, PHONE);
  await visitor.goto('/plot/corridors-1');
  await visitor.locator('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(visitor.locator('dialog').getByText('to edit.')).toBeVisible();
  await expect(visitor.locator('form.shop-edit')).toHaveCount(0);
  await visitor.context().close();
});

test('the owner publishes on desktop', async ({ browser }) => {
  const owner = await pageAs(browser, server, 'ShopOwner', DESKTOP);
  await owner.goto('/plot/corridors-2');
  const card = owner.locator('section.plot-detail__sheet');
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  const oform = card.getByRole('form', { name: 'Editing' });
  await expect(oform.getByText('reviews it')).toHaveCount(0);
  await expect(oform.getByRole('button', { name: 'Force edit' })).toBeVisible();
  await expect(oform.getByRole('button', { name: 'Suggest edit' })).toBeVisible();
  const fresh = 'Fresh new description from the owner.';
  await textbox(oform, 'About').fill(fresh);
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card.getByText('Discard your unsaved edit?')).toBeVisible();
  await card.locator('.plot-detail__notice').getByRole('button', { name: 'Keep editing' }).click();
  await oform.getByRole('button', { name: 'Force edit' }).click();
  await expect(card.locator('.plot-detail__notice')).toContainText('Edit saved.');
  await expect(card.locator('.plot-detail__text')).toContainText(fresh);
  await card.getByRole('tab', { name: 'History' }).click();
  await expect(card.locator('.shop-history__item').first(), 'in History').toContainText('ShopOwner edited About');
  await card.getByRole('tab', { name: 'Comments' }).click();
  const r = lastRevision();
  expect(r).toMatchObject({ status: 'approved', direct: 1 });
  expect(JSON.parse(r.new_values).description).toBe(fresh);
  await expect(announced(owner)).toHaveText('Edit saved.');

  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await textbox(oform, 'Palette').fill('Owner asks for review');
  await oform.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(card.locator('.plot-detail__notice')).toContainText('Sent for review');
  expect(lastRevision().status, 'Suggest edit queues it').toBe('pending');
  await expectNoProblems(owner);
  await owner.context().close();
});

test('closing the tab warns only with unsaved changes', async ({ browser }) => {
  async function warns(setup) {
    const p = await pageAs(browser, server, 'Tester', PHONE);
    await p.goto('/plot/corridors-1');
    await p.locator('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
    await setup(p, p.locator('form.shop-edit'));
    let warned = false;
    p.on('dialog', async (d) => { if (d.type() === 'beforeunload') warned = true; await d.accept(); });
    await p.close({ runBeforeUnload: true });
    await new Promise((r) => setTimeout(r, 500));
    await p.context().close();
    return warned;
  }
  const typed = (p, f) => textbox(f, 'Palette').fill('changed');
  expect(await warns(typed), 'unsaved changes').toBe(true);
  expect(await warns(async () => {}), 'form open, unchanged').toBe(false);
  expect(await warns(async (p, f) => { await typed(p, f); await f.getByRole('button', { name: 'Undo changes to Palette' }).click(); }), 'after undoing').toBe(false);
  expect(await warns(async (p, f) => {
    await typed(p, f);
    await f.getByRole('button', { name: 'Cancel' }).click();
    await f.getByRole('button', { name: 'Discard' }).click();
    await expect(p.locator('form.shop-edit')).toHaveCount(0);
  }), 'after Cancel, Discard').toBe(false);
  expect(await warns(async (p) => {
    await typed(p, p.locator('form.shop-edit'));
    await p.locator('dialog').getByRole('button', { name: 'Close' }).click();
    await p.locator('.plot-detail__notice').getByRole('button', { name: 'Discard' }).click();
    await expect(p.locator('dialog')).toHaveCount(0);
  }), 'after closing the card with Discard').toBe(false);
});

test("a moderator publishes someone else's shop", async ({ browser }) => {
  const mod = await pageAs(browser, server, 'ModTester', PHONE);
  await mod.goto('/plot/corridors-3');
  await mod.locator('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
  const mform = mod.locator('dialog').getByRole('form', { name: 'Editing' });
  await textbox(mform, 'Shop name').fill('Dragon Shop');
  await mform.getByRole('button', { name: 'Force edit' }).click();
  await expect(mod.locator('dialog h2')).toContainText('Dragon Shop');
  expect(lastRevision()).toMatchObject({ direct: 1, status: 'approved' });
  await expectNoProblems(mod);
});
