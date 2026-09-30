/**
 * The accounting policies as this company's statements state them.
 *
 * A framework pack carries a generic policy for every topic the framework
 * covers. A published set states the policies the company actually applies,
 * in terms of what it actually holds: the property, plant and equipment
 * policy names its classes, their depreciation method and useful lives; a
 * provisions policy appears only where the company carries provisions.
 *
 * A policy the preparer has rewritten is theirs and is left exactly as they
 * wrote it. Only the framework's own wording is recomposed from the facts.
 */
import { AccountIndex, type FinancialFacts } from '../disclosures/accountIndex';
import type { DocPolicyNode, DocPolicySetNode } from '../document/documentModel';

const norm = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();
const code = (p: DocPolicyNode) => String(p.policy_code || '').toUpperCase();

type Composed = { title?: string; body: string; table?: string[][]; bodyAfter?: string };
type Composer = (index: AccountIndex) => Composed | null;

const has = (index: AccountIndex, filter: Parameters<AccountIndex['find']>[0]) =>
  index.find(filter).some((a) => a.closing !== 0 || a.prior !== 0 || a.activity !== 0 || a.priorActivity !== 0);

/** Depreciation method and average useful life by class, from the register. */
function usefulLives(index: AccountIndex): { table: string[][]; landNotDepreciated: boolean } | null {
  const register = index.register;
  if (!register?.length) return null;
  // Only assets registered against a property, plant and equipment account
  // are classes of PPE; an asset pointed at any other account (a bank, a
  // receivable) is a register error the policy must not repeat.
  const nameOf = new Map(
    index.find({ subcategory: 'Property, Plant and Equipment' }).map((a) => [a.id, a.name]),
  );
  const byClass = new Map<string, number[]>();
  let land = false;
  for (const asset of register) {
    if (asset.status === 'disposed' || !asset.asset_account_id) continue;
    const depreciates = !!asset.useful_life_years && asset.depreciation_method && asset.depreciation_method !== 'none';
    if (!depreciates) {
      land = true;
      continue;
    }
    const name = nameOf.get(asset.asset_account_id);
    if (!name) continue;
    byClass.set(name, [...(byClass.get(name) || []), Number(asset.useful_life_years)]);
  }
  if (!byClass.size) return null;
  const rows = [...byClass.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, lives]) => {
      const avg = Math.round(lives.reduce((s, v) => s + v, 0) / lives.length);
      return [name, 'Straight line', `${avg} year${avg === 1 ? '' : 's'}`];
    });
  return { table: [['Item', 'Depreciation method', 'Average useful life'], ...rows], landNotDepreciated: land };
}

const COMPOSERS: Record<string, Composer> = {
  'POL.JUDGEMENTS': (index) => {
    const sources: string[] = [];
    if (has(index, { subcategory: 'Property, Plant and Equipment' })) {
      sources.push(
        'Useful lives and residual values of property, plant and equipment: the company reviews the estimated useful lives, residual values and depreciation methods of its property, plant and equipment where there is an indication that they have changed. The depreciation charge is affected by these estimates.',
      );
    }
    if (index.find({ subcategory: 'Trade and Other Receivables' }).some((a) => a.closing < 0 || a.prior < 0)) {
      sources.push(
        'Impairment of trade receivables: the company assesses its trade receivables for impairment at each reporting date. In determining whether an impairment loss should be recognised, the company judges whether there is observable evidence of a measurable decrease in the estimated future cash flows from its receivables.',
      );
    }
    if (has(index, { subcategory: 'Inventory' })) {
      sources.push(
        'Inventories: management assesses whether inventory is impaired by comparing its cost to its estimated selling price less costs to complete and sell.',
      );
    }
    if (has(index, { category: 'Taxation' })) {
      sources.push(
        'Taxation: judgement is required in determining the provision for income taxes. Where the final tax outcome differs from the amounts initially recorded, such differences impact the income tax provisions in the period in which the determination is made.',
      );
    }
    return {
      body: [
        'In preparing the annual financial statements, management is required to make judgements, estimates and assumptions that affect the amounts represented in the annual financial statements and related disclosures. The estimates and associated assumptions are based on historical experience and other factors that are considered to be relevant. Actual results in the future could differ from these estimates.',
        'Management did not make critical judgements in the application of accounting policies, apart from those involving estimations, which would significantly affect the annual financial statements.',
        ...(sources.length
          ? ['The key sources of estimation uncertainty at the end of the reporting period are:', ...sources]
          : []),
      ].join('\n\n'),
    };
  },

  'POL.REVENUE': (index) => {
    const parts = [
      'Revenue is measured at the fair value of the consideration received or receivable, net of value added tax, trade discounts and volume rebates.',
      'Revenue from the sale of goods is recognised when the significant risks and rewards of ownership have been transferred to the buyer, the company retains neither continuing managerial involvement nor effective control over the goods sold, the amount of revenue can be measured reliably, and it is probable that the economic benefits associated with the transaction will flow to the company.',
      'Revenue from the rendering of services is recognised by reference to the stage of completion of the transaction at the reporting date when the outcome of the transaction can be estimated reliably.',
    ];
    if (has(index, { category: 'Other Income' })) {
      parts.push('Interest income is recognised in profit or loss using the effective interest rate method.');
    }
    return { body: parts.join('\n\n') };
  },

  'POL.PPE': (index) => {
    const lives = usefulLives(index);
    const parts = [
      'Property, plant and equipment are tangible assets which the company holds for its own use or for rental to others and which are expected to be used for more than one period.',
      'Property, plant and equipment is initially measured at cost. Cost includes costs incurred initially to acquire or construct an item of property, plant and equipment and costs incurred subsequently to add to, replace part of, or service it. If a replacement cost is recognised in the carrying amount of an item of property, plant and equipment, the carrying amount of the replaced part is derecognised.',
      'Property, plant and equipment is subsequently stated at cost less accumulated depreciation and any accumulated impairment losses.',
      lives
        ? 'Depreciation is provided using the straight-line method to write down the cost, less estimated residual value, over the useful life of the property, plant and equipment as follows:'
        : 'Depreciation is provided using the straight-line method to write down the cost, less estimated residual value, over the useful life of each item of property, plant and equipment.',
    ];
    const after = [
      ...(lives?.landNotDepreciated ? ['Land is not depreciated.'] : []),
      "Where major components of an item of property, plant and equipment have significantly different patterns of consumption of economic benefits, the cost of the asset is allocated to the components and they are depreciated separately over each component's useful life.",
      'The residual value, depreciation method and useful life of each asset are reviewed only where there is an indication that there has been a significant change from the previous estimate.',
      'Gains and losses on disposals are recognised in profit or loss.',
    ];
    return { body: parts.join('\n\n'), table: lives?.table, bodyAfter: after.join('\n\n') };
  },

  'POL.FININST': (index) => {
    const parts = [
      'Initial measurement: When a financial asset or financial liability is recognised initially, it is measured at the transaction price (including transaction costs) unless the arrangement constitutes, in effect, a financing transaction.',
      'Financial instruments at amortised cost: These include loans, trade receivables and trade payables. They are subsequently measured at amortised cost using the effective interest method. Debt instruments classified as current assets or current liabilities are measured at the undiscounted amount of the cash expected to be received or paid, unless the arrangement effectively constitutes a financing transaction.',
      'At each reporting date, the carrying amounts of assets held in this category are reviewed to determine whether there is objective evidence of impairment. If there is, the recoverable amount is estimated and compared with the carrying amount, and any impairment loss is recognised immediately in profit or loss.',
    ];
    if (has(index, { subcategory: 'Cash and Cash Equivalents' })) {
      parts.push('Cash and cash equivalents: Cash and cash equivalents include cash on hand, demand deposits and other short-term highly liquid investments with original maturities of three months or less.');
    }
    return { body: parts.join('\n\n') };
  },

  'POL.IMPAIRMENT': (index) => {
    const intangibles = has(index, { subcategory: 'Intangible Assets' });
    return {
      body: [
        `The company assesses at each reporting date whether there is any indication that property, plant and equipment${intangibles ? ' or intangible assets' : ''} may be impaired.`,
        'If there is any such indication, the recoverable amount of any affected asset (or group of related assets) is estimated and compared with its carrying amount. If the estimated recoverable amount is lower, the carrying amount is reduced to its estimated recoverable amount, and an impairment loss is recognised immediately in profit or loss.',
        'If an impairment loss subsequently reverses, the carrying amount of the asset (or group of related assets) is increased to the revised estimate of its recoverable amount, but not in excess of the amount that would have been determined had no impairment loss been recognised for the asset (or group of assets) in prior years. A reversal of impairment is recognised immediately in profit or loss.',
      ].join('\n\n'),
    };
  },

  'POL.PROVISIONS': (index) => (has(index, { subcategory: 'Provisions' }) ? { body: '' } : null),

  'POL.EMPLOYEE': (index) =>
    has(index, { subcategory: 'Employee Costs' })
      ? {
          body: 'The cost of short-term employee benefits (those payable within twelve months after the service is rendered, such as paid vacation leave, sick leave and bonuses) is recognised in the period in which the service is rendered and is not discounted.',
        }
      : null,

  'POL.TAX': (index) =>
    has(index, { category: 'Taxation' })
      ? {
          title: 'Tax',
          body: [
            'Current tax for current and prior periods is, to the extent unpaid, recognised as a liability. If the amount already paid in respect of current and prior periods exceeds the amount due for those periods, the excess is recognised as an asset.',
            'Current tax liabilities (assets) for the current and prior periods are measured at the amount expected to be paid to (recovered from) the tax authorities, using the tax rates (and tax laws) that have been enacted or substantively enacted by the reporting date.',
            'The tax expense for the period comprises current and deferred tax. Tax is recognised in profit or loss, except for a change attributable to an item of income or expense recognised as other comprehensive income or as equity, in which case it is also recognised directly in other comprehensive income or equity.',
          ].join('\n\n'),
        }
      : null,

  'POL.BORROWINGCOST': (index) =>
    has(index, { category: 'Finance Costs' })
      ? { body: 'Borrowing costs are recognised as an expense in the period in which they are incurred.' }
      : null,

  'POL.EQUITY': (index) =>
    has(index, { subcategory: 'Issued Capital' })
      ? {
          title: 'Share capital and equity',
          body: [
            'An equity instrument is any contract that evidences a residual interest in the assets of an entity after deducting all of its liabilities.',
            'Ordinary shares are classified as equity. Dividends are recognised as a liability in the period in which they are declared.',
          ].join('\n\n'),
        }
      : null,
};

/**
 * Compose the policies of a policy set from the company's facts. `defaults`
 * is the framework pack's own wording by policy code — a policy whose body is
 * still that wording (or empty) has not been edited and is recomposed.
 */
export function composeCompanyPolicies(
  set: DocPolicySetNode,
  facts: FinancialFacts | null | undefined,
  defaults: Map<string, string>,
): DocPolicySetNode {
  const index = new AccountIndex(facts);
  if (!index.rows.length) return set;
  const policies: DocPolicyNode[] = [];
  for (const policy of set.policies || []) {
    const composer = COMPOSERS[code(policy)];
    const untouched =
      policy.source === 'framework' ||
      !norm(policy.body) ||
      norm(policy.body) === norm(defaults.get(code(policy)) || '');
    if (!composer || !untouched) {
      policies.push(policy);
      continue;
    }
    const composed = composer(index);
    if (!composed) continue; // Nothing in the books the policy would govern.
    policies.push({
      ...policy,
      title: composed.title ?? policy.title,
      body: composed.body || policy.body,
      table: composed.table,
      bodyAfter: composed.bodyAfter,
    });
  }
  return { ...set, policies };
}
