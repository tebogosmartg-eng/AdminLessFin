# SmartSelect — AdminLess Fin Platform UX Standard

**Status:** Adopted · **Applies to:** every searchable dropdown in AdminLess Fin
**Component:** [`src/components/cotf/SmartSelect.tsx`](../../src/components/cotf/SmartSelect.tsx)

## The standard, in one sentence

AdminLess Fin has **one** selection experience. Users learn the interaction once and
meet it everywhere. **A dropdown must never be a dead end** — if the record a user
needs does not exist, they create it inline, without leaving the form they are in.

`SmartSelect` is that experience. New and existing searchable dropdowns adopt it
instead of introducing their own pattern.

---

## 1. When this standard applies

Use `SmartSelect` for **any field where the user picks one record from a set that
can grow** — customers, suppliers, products, accounts, tax codes, projects,
employees, assets, warehouses, and so on.

Do **not** use it for fixed, closed enumerations that a user can never extend
(e.g. Asset / Liability / Equity account *type*, invoice *status*, debit/credit).
Those stay a plain `Select`. The distinction is simple: *if a user could ever need
a value that isn't in the list yet, it's a `SmartSelect`.*

## 2. Standard interaction (every SmartSelect supports)

- **Search** — a filter box focused on open.
- **Keyboard navigation** — arrow keys, Enter to choose, Esc to close.
- **Type-ahead filtering** — matches the label plus any `keywords`/`description`.
- **Clear selection** — an inline ✕ on the trigger (`allowClear`, on by default;
  turn off for required fields).
- **Empty state** — see §3.
- **Recently Used section** — the last 5 chosen records surface first when no search
  is active (enabled by passing `recentScope`; namespaced per company).
- **Create-on-the-Fly** — see §4.
- **Automatic selection after creation** — the new record is selected the instant it
  is saved, before any refetch completes.

## 3. Standard empty state

When the search matches nothing, show exactly:

```
No matching results found.

＋ Create "<user input>"
```

The typed value is passed straight into the create form and pre-fills the primary
field. A persistent **＋ Create** row also sits at the bottom of the list so a user
can create even when partial matches exist.

## 4. Preserve the workflow

Creating a record from a `SmartSelect` must:

1. **Never navigate away** — the create form is a compact modal, portaled over the
   current page.
2. **Never lose entered data** — the surrounding form is untouched.
3. **Close automatically** after a successful save.
4. **Automatically select** the new record in the originating field.
5. **Return focus** to that field, so a keyboard user lands on the control they just
   completed and tabs straight to the next one.

Create forms are **lightweight**: they ask only for the minimum a record needs.
Everything else is configured later on the entity's management page. Any coupling to
the accounting engine (costing defaults, control-account wiring, auto-assigned
account codes) lives inside the entity's create config — never in the UI.

## 5. Rollout

`SmartSelect` is the standard selector for all of the following. **Implement only
where a backend create endpoint exists today; future modules adopt the component
rather than inventing a new dropdown.**

| Entity | Backend today | Status |
|---|---|---|
| Customers | ✅ `customers` | Config ready · wired in InvoiceForm |
| Suppliers | ✅ `vendors` | Config ready |
| Products / Services | ✅ `products` | Config ready · wired in InvoiceForm |
| Revenue / Expense Accounts | ✅ `chart-of-accounts` | Config ready · wired in InvoiceForm |
| Tax Codes | ✅ `tax-rates` | Config ready · wired in InvoiceForm |
| Projects | ✅ `projects` | Config ready · wired in InvoiceForm |
| Employees | ✅ `employees` | Select-only until a create config is added |
| Assets | ✅ `fixed-assets` | Select-only until a create config is added |
| Warehouses | ⛔ none | Needs backend before COTF |
| Departments | ⛔ none | Needs backend before COTF |
| Cost Centres | ⛔ none | Needs backend before COTF |
| Payment Methods | ⛔ none | Needs backend before COTF |
| Payment Terms | ⛔ none | Needs backend before COTF |

An entity without a create endpoint still uses `SmartSelect` for a consistent
*search/select* experience — just omit `createConfig`, and the ＋ Create affordance
is hidden until the backend lands.

## 6. How to adopt it (per dropdown)

```tsx
import { SmartSelect, type SmartSelectOption } from '@/components/cotf/SmartSelect';
import { customerCreateConfig } from '@/components/cotf/entityCreateConfigs';

const options = useMemo<SmartSelectOption[]>(
  () => (customers ?? []).map(c => ({ value: c.id, label: c.name, description: c.email ?? undefined })),
  [customers],
);
const createConfig = useMemo(() => customerCreateConfig({ companyId }), [companyId]);

<SmartSelect
  entityLabel="customer"
  options={options}
  value={field.value}
  onChange={field.onChange}
  recentScope={`customer:${companyId}`}   // omit to disable Recently Used
  createConfig={createConfig}              // omit to hide Create-on-the-Fly
  invalidateKeys={[['customers', companyId]]}
/>
```

Adding a **new** creatable entity: add a factory to
[`entityCreateConfigs.ts`](../../src/components/cotf/entityCreateConfigs.ts) that
posts to its edge function and returns `{ value, label }`. The create form is
declared as a field list (`text` / `number` / `select`); mark the primary field
`prefillFromSearch: true`.

## 7. Reference implementation

[`InvoiceForm.tsx`](../../src/components/InvoiceForm.tsx) — Customer, Product/Service,
Income Account, Tax Code, and Project are all `SmartSelect`. It is the canonical
example of the full pattern, including auto-select and workflow preservation.
