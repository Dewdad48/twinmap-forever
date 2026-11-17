<script lang="ts">
  // Items: bags, bank, keyring and what is worn by the character shown, as wide as the window, from
  // the sheet the app keeps (shared/items.ts). It reads the same with the game closed, and says how
  // old it is. What is typed in the filter is looked for in every other character's sheet too.
  import { ago, type Known } from '../../shared/characters'
  import { coins, filterRows, itemRows, othersHolding, PLACES, QUALITY_COLORS, sortRows, type Column, type ItemFacts, type ItemRow, type Place } from '../../shared/items'
  import type { Sheets } from '../../shared/sheet'
  import { TILES } from './web'

  let { sheets, shown, known, now, onpick }: { sheets: Sheets; shown: Known | null; known: Known[]; now: number; onpick: (key: string) => void } = $props()

  // What the game says of each item, made beside the map (tiles-worker.ts). Without it the items have their numbers and no prices.
  let facts = $state.raw<ItemFacts>({})
  $effect(() => {
    void fetch(`${TILES}/items.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((read: ItemFacts) => (facts = read))
      .catch(() => {})
  })

  let typed = $state('')
  let place = $state<Place | null>(null)
  let column = $state<Column>('value')
  let up = $state(false)
  const sheet = $derived(shown ? sheets[shown.key] : undefined)
  const all = $derived(sheet ? itemRows(sheet, facts) : [])
  const rows = $derived(sortRows(filterRows(all, typed).filter((r) => !place || r.place === place), column, up))
  const others = $derived(shown ? othersHolding(sheets, shown.key, facts, typed).flatMap((o) => o.rows.map((r) => ({ ...r, who: known.find((k) => k.key === o.key) }))) : [])
  const othersSorted = $derived(sortRows(others, column, up) as typeof others)
  const worth = $derived(all.reduce((n, r) => n + r.value, 0))
  const money = $derived(typeof sheet?.pieces.money === 'number' ? sheet.pieces.money : null)
  const places = $derived(PLACES.map((p) => ({ p, n: all.filter((r) => r.place === p).length })).filter(({ p, n }) => n > 0 || p !== 'Keyring'))

  const COLUMNS: [Column, string][] = [['name', 'Item'], ['type', 'Type'], ['place', 'Where'], ['n', 'Qty'], ['value', 'Value']]
  // A click sorts by the column; another click turns it round. Names and types start from A, numbers from the most.
  function sortBy(c: Column): void {
    if (c === column) up = !up
    else ((column = c), (up = c === 'name' || c === 'type' || c === 'place'))
  }
  const when = $derived.by(() => {
    if (!sheet || !shown) return ''
    const bags = shown.live ? 'Bags as they are now' : `Bags as of ${ago(shown.seen, now)}`
    const bank = sheet.at.bank ? `bank ${ago(sheet.at.bank, now)}, when it was last open` : 'bank not seen yet: open it in game once'
    return `${bags} · ${bank[0]!.toUpperCase()}${bank.slice(1)}`
  })
</script>

{#snippet money_(copper: number)}
  {#each coins(copper) as [n, coin] (coin)}{n}<i class="coin {coin}"></i>{:else}<span class="none">-</span>{/each}
{/snippet}

{#snippet item(r: ItemRow)}
  <span class="it">
    <span class="ico"><img src="{TILES}/items/{r.id}.png" alt="" onerror={(e) => e.currentTarget.remove()} /></span>
    <span class="nm" style:color={QUALITY_COLORS[r.quality] ?? 'var(--text)'}>{r.name}</span>
  </span>
{/snippet}

{#snippet heads(columns: [Column | null, string][])}
  <thead>
    <tr>
      {#each columns as [c, label] (label)}
        <th class:num={c === 'n' || c === 'value'} class:on={c === column} aria-sort={c === column ? (up ? 'ascending' : 'descending') : undefined}>
          {#if c}
            <button onclick={() => sortBy(c)}>{label}{#if c === column}<svg viewBox="0 0 10 10" aria-hidden="true"><path d={up ? 'M1 7h8L5 2z' : 'M1 3h8L5 8z'} /></svg>{/if}</button>
          {:else}{label}{/if}
        </th>
      {/each}
    </tr>
  </thead>
{/snippet}

<main class="surface">
  {#if !shown || !sheet}
    <p class="empty">No character yet. Play one with the Twinmap Forever addon on and its bags show here, also when the game is closed.</p>
  {:else}
    <div class="tools">
      <input type="search" placeholder="Filter by name or type" aria-label="Filter items" bind:value={typed} />
      <div class="chips" role="group" aria-label="Where">
        <button class="chip" aria-pressed={!place} onclick={() => (place = null)}>All <b>{all.length}</b></button>
        {#each places as { p, n } (p)}
          <button class="chip" aria-pressed={place === p} onclick={() => (place = place === p ? null : p)}>{p} <b>{n}</b></button>
        {/each}
      </div>
      <p class="sum">Worth {@render money_(worth)} at a vendor{#if money !== null}{' · '}Money {@render money_(money)}{/if}</p>
    </div>
    <table>
      {@render heads(COLUMNS)}
      <tbody>
        {#each rows as r (r.place + r.id)}
          <tr><td>{@render item(r)}</td><td class="dim">{r.type}</td><td>{r.place}</td><td class="num">{r.n}</td><td class="num">{@render money_(r.value)}</td></tr>
        {:else}
          <tr><td colspan="5" class="none">{typed ? `${shown.key} has nothing like "${typed}".` : 'Nothing here.'}</td></tr>
        {/each}
      </tbody>
    </table>
    <p class="foot">{when}</p>

    {#if othersSorted.length}
      <h2>Other characters<span>kept on this PC</span></h2>
      <table>
        {@render heads([['name', 'Item'], [null, 'Character'], ['type', 'Type'], ['place', 'Where'], ['n', 'Qty'], ['value', 'Value']])}
        <tbody>
          {#each othersSorted as r (r.who?.key + r.place + r.id)}
            <tr class="other" onclick={() => r.who && onpick(r.who.key)} title="Show {r.who?.key}">
              <td>{@render item(r)}</td><td style:color={r.who?.color}>{r.who?.key}</td><td class="dim">{r.type}</td><td>{r.place}</td><td class="num">{r.n}</td><td class="num">{@render money_(r.value)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="foot">{[...new Set(othersSorted.map((r) => r.who))].map((k) => k && `${k.key}: seen ${ago(k.seen, now)}`).filter(Boolean).join(' · ')}</p>
    {/if}
  {/if}
</main>

<style>
  main {
    position: absolute;
    inset: 46px 0 0;
    overflow-y: auto;
    padding: 14px 20px 32px;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    max-width: 520px;
    margin: 64px auto;
    color: var(--text-dim);
    text-align: center;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 18px;
    margin: 0 0 12px;
  }
  input {
    width: 280px;
    height: 30px;
    padding: 0 10px;
    border: 0;
    background: var(--stone-950);
    box-shadow: inset 0 0 0 1px var(--bronze-700);
    color: var(--text);
    font: var(--t-body);
  }
  input:focus {
    outline: none;
    box-shadow: inset 0 0 0 1px var(--bronze-400);
  }
  .chips {
    display: flex;
    gap: 6px;
  }
  .chip {
    padding: 3px 10px;
    border: 0;
    border-radius: 13px;
    background: none;
    box-shadow: inset 0 0 0 1px var(--stone-500);
    color: var(--text-dim);
    font: var(--t-body);
    cursor: pointer;
  }
  .chip b {
    margin-left: 3px;
    font-weight: 500;
    color: var(--text-off);
  }
  .chip[aria-pressed='true'] {
    background: var(--stone-600);
    box-shadow: inset 0 0 0 1px var(--bronze-500);
    color: var(--gold);
  }
  .chip[aria-pressed='true'] b {
    color: var(--text-dim);
  }
  .sum {
    margin: 0 0 0 auto;
    color: var(--text-dim);
  }
  .coin {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin: 0 4px 0 2px;
    border-radius: 50%;
    box-shadow:
      inset 0 -1px 0 #0006,
      0 0 0 1px #000a;
  }
  .coin.g {
    background: #e8c25a;
  }
  .coin.s {
    background: #c8ccd2;
  }
  .coin.c {
    background: #c07a46;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    padding: 6px 10px;
    border-bottom: 1px solid var(--bronze-700);
    text-align: left;
    font: 500 13px/17px var(--font);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-dim);
    white-space: nowrap;
  }
  th button {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    color: inherit;
    cursor: pointer;
  }
  th.on,
  th button:hover {
    color: var(--gold);
  }
  th svg {
    width: 9px;
    height: 9px;
    margin-left: 5px;
    fill: currentColor;
  }
  td {
    padding: 3px 10px;
    border-bottom: 1px solid #ffffff0a;
    white-space: nowrap;
  }
  tr:nth-child(even) td {
    background: #ffffff05;
  }
  .num {
    text-align: right;
  }
  .dim {
    color: var(--text-dim);
  }
  .none {
    color: var(--text-off);
  }
  .it {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ico {
    flex: none;
    width: 26px;
    height: 26px;
    background: var(--stone-950);
    box-shadow: 0 0 0 1px #000;
  }
  .ico img {
    display: block;
    width: 26px;
    height: 26px;
  }
  .nm {
    text-shadow: 0 1px 0 #000;
  }
  .other {
    cursor: pointer;
  }
  .other:hover td {
    background: #ffffff0d;
  }
  h2 {
    margin: 22px 0 6px;
    font: var(--t-title);
    color: var(--gold);
  }
  h2 span {
    margin-left: 8px;
    font: var(--t-small);
    color: var(--text-dim);
  }
  .foot {
    margin: 10px 0 0;
    font: var(--t-small);
    color: var(--text-off);
  }
</style>
