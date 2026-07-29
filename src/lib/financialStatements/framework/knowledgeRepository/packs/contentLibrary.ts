/**
 * Knowledge Repository — Framework Pack Content Library (V14.2 / 2026.1).
 *
 * Authoritative reporting knowledge for IFRS, IFRS for SMEs, GRAP and IPSAS.
 * Consumed exclusively through the Knowledge Repository registry; the Framework
 * Content Engine continues to receive FrameworkDefinition objects unchanged.
 *
 * DO NOT import this module from document / publication code directly — use
 * frameworkContent.ts (compatibility facade) or knowledgeRepository/index.ts.
 */

import type {
  FrameworkDefinition,
  FrameworkExtensionPoint,
  FrameworkKey,
  FrameworkNoteDef,
  FrameworkPolicyDef,
  FrameworkStatementDef,
  FrameworkTableDef,
} from '../types';
import { deepFreeze, pol } from '../compose';
import { buildIfrsForSmeNotes, buildIfrsForSmePolicies } from './ifrsSmePack';

function ifrsForSmeExtensionPoints(): FrameworkExtensionPoint[] {
  // Agriculture biological assets are a core conditional disclosure in the SME
  // completeness pack (DISC.BIOLOGICAL). Keep industry shells for other sectors.
  return [
    {
      code: 'EXT.AGRICULTURE',
      title: 'Agriculture',
      description: 'Specialised agricultural activities under IFRS for SMEs Section 34.',
      conditionKey: 'industryAgriculture',
    },
    {
      code: 'EXT.EXTRACTIVE',
      title: 'Extractive activities',
      description: 'Exploration and evaluation assets in the extractive industries.',
      conditionKey: 'industryExtractive',
    },
    {
      code: 'EXT.FINANCIAL_SERVICES',
      title: 'Financial services',
      description: 'Additional disclosures for regulated financial-services entities.',
      conditionKey: 'industryFinancialServices',
    },
  ];
}

// ── Statement Library ────────────────────────────────────────────────────────
const PRIVATE_SECTOR_STATEMENTS: FrameworkStatementDef[] = [
  {
    statement_type: 'financial_position',
    title: 'Statement of Financial Position',
    purpose: 'Presents the assets, liabilities and equity of the entity at the reporting date.',
  },
  {
    statement_type: 'financial_performance',
    title: 'Statement of Profit or Loss and Other Comprehensive Income',
    purpose: 'Presents income and expenses, and the profit or loss and other comprehensive income for the period.',
  },
  {
    statement_type: 'changes_in_equity',
    title: 'Statement of Changes in Equity',
    purpose: 'Reconciles the opening and closing balances of each component of equity.',
  },
  {
    statement_type: 'cash_flows',
    title: 'Statement of Cash Flows',
    purpose: 'Presents cash generated and used by operating, investing and financing activities.',
  },
];

const PUBLIC_SECTOR_STATEMENTS: FrameworkStatementDef[] = [
  {
    statement_type: 'financial_position',
    title: 'Statement of Financial Position',
    purpose: 'Presents the assets, liabilities and net assets of the entity at the reporting date.',
  },
  {
    statement_type: 'financial_performance',
    title: 'Statement of Financial Performance',
    purpose: 'Presents revenue and expenses and the surplus or deficit for the period.',
  },
  {
    statement_type: 'changes_in_equity',
    title: 'Statement of Changes in Net Assets',
    purpose: 'Reconciles the opening and closing balances of each component of net assets.',
  },
  {
    statement_type: 'cash_flows',
    title: 'Cash Flow Statement',
    purpose: 'Presents cash flows from operating, investing and financing activities.',
  },
];

// ── Table Library ────────────────────────────────────────────────────────────
// Reusable statutory tables. Where a trial-balance fact exists it is auto-filled;
// otherwise the row is professionally identified as requiring manual completion.

const YEAR_COLUMNS = ['Description', 'Current year', 'Prior year'];

function ppeRollforwardTable(): FrameworkTableDef {
  return {
    title: 'Property, plant and equipment',
    caption: 'Reconciliation of the carrying amount at the beginning and end of the year.',
    columns: YEAR_COLUMNS,
    factMappings: [
      {
        label: 'Carrying amount at the end of the year',
        line_code: 'sfp.ppe',
        comparative_line_code: 'sfp.ppe.prior',
      },
    ],
    manualRows: [
      'Cost at the beginning of the year',
      'Additions',
      'Disposals',
      'Cost at the end of the year',
      'Accumulated depreciation at the beginning of the year',
      'Depreciation charge for the year',
      'Accumulated depreciation on disposals',
      'Impairment losses recognised',
      'Accumulated depreciation at the end of the year',
    ],
  };
}

function intangiblesRollforwardTable(): FrameworkTableDef {
  return {
    title: 'Intangible assets',
    caption: 'Reconciliation of the carrying amount of intangible assets.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Cost at the beginning of the year',
      'Additions - separately acquired',
      'Additions - internally generated',
      'Disposals',
      'Cost at the end of the year',
      'Accumulated amortisation and impairment at the beginning of the year',
      'Amortisation charge for the year',
      'Impairment losses recognised',
      'Accumulated amortisation and impairment at the end of the year',
      'Carrying amount at the end of the year',
    ],
  };
}

function investmentPropertyTable(): FrameworkTableDef {
  return {
    title: 'Investment property',
    caption: 'Reconciliation of the carrying amount of investment property.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Fair value at the beginning of the year',
      'Additions from acquisitions',
      'Subsequent expenditure capitalised',
      'Disposals',
      'Fair value adjustments recognised in profit or loss',
      'Transfers to or from property, plant and equipment',
      'Fair value at the end of the year',
    ],
  };
}

function revenueDisaggregationTable(): FrameworkTableDef {
  return {
    title: 'Disaggregation of revenue',
    caption: 'Revenue disaggregated by major category and timing of transfer.',
    columns: YEAR_COLUMNS,
    factMappings: [
      {
        label: 'Total revenue from contracts with customers',
        line_code: 'perf.total_revenue',
        comparative_line_code: 'perf.total_revenue.prior',
      },
    ],
    manualRows: [
      'Sale of goods',
      'Rendering of services',
      'Royalties, licences and other',
      'Revenue recognised at a point in time',
      'Revenue recognised over time',
    ],
  };
}

function receivablesAgeingTable(): FrameworkTableDef {
  return {
    title: 'Trade and other receivables - ageing analysis',
    caption: 'Gross carrying amount and loss allowance by ageing band.',
    columns: ['Ageing band', 'Gross carrying amount', 'Expected loss allowance', 'Net carrying amount'],
    manualRows: [
      'Not past due',
      'Past due 1 - 30 days',
      'Past due 31 - 60 days',
      'Past due 61 - 90 days',
      'Past due more than 90 days',
      'Total',
    ],
  };
}

function payablesTable(): FrameworkTableDef {
  return {
    title: 'Trade and other payables',
    caption: 'Analysis of trade and other payables.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Trade payables',
      'Value added tax',
      'Accruals',
      'Amounts received in advance',
      'Other payables',
      'Total',
    ],
  };
}

function leaseMaturityTable(): FrameworkTableDef {
  return {
    title: 'Lease liabilities - maturity analysis',
    caption: 'Undiscounted contractual cash flows of lease liabilities.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Not later than one year',
      'Later than one year and not later than five years',
      'Later than five years',
      'Total undiscounted lease payments',
      'Effect of discounting',
      'Carrying amount of lease liabilities',
    ],
  };
}

function borrowingsTable(): FrameworkTableDef {
  return {
    title: 'Borrowings',
    caption: 'Analysis of borrowings by class and maturity.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Secured loans',
      'Unsecured loans',
      'Instalment sale and finance lease liabilities',
      'Total borrowings',
      'Current portion',
      'Non-current portion',
    ],
  };
}

function deferredTaxTable(): FrameworkTableDef {
  return {
    title: 'Deferred taxation',
    caption: 'Deferred tax assets and liabilities by temporary difference.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Property, plant and equipment',
      'Provisions and accruals',
      'Assessed losses carried forward',
      'Other temporary differences',
      'Net deferred tax asset / (liability)',
    ],
  };
}

function taxReconciliationTable(): FrameworkTableDef {
  return {
    title: 'Reconciliation of the effective tax rate',
    caption: 'Reconciliation of the tax expense to the standard rate of tax.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Accounting profit / (loss) before tax',
      'Tax at the standard rate',
      'Non-deductible expenses',
      'Exempt income',
      'Assessed losses not recognised',
      'Total tax expense',
    ],
  };
}

function shareCapitalTable(): FrameworkTableDef {
  return {
    title: 'Share capital',
    caption: 'Authorised and issued share capital.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Authorised share capital',
      'Issued ordinary shares',
      'Share premium',
      'Total issued share capital',
    ],
  };
}

function cashFlowReconciliationTable(): FrameworkTableDef {
  return {
    title: 'Reconciliation of profit to cash generated from operations',
    caption: 'Adjustment of profit or loss for non-cash items and working capital movements.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Profit / (loss) before taxation',
      'Adjustments for depreciation and amortisation',
      'Adjustments for finance costs and investment income',
      'Adjustments for other non-cash items',
      'Movements in working capital',
      'Cash generated from operations',
    ],
  };
}

function financialInstrumentCategoriesTable(): FrameworkTableDef {
  return {
    title: 'Categories of financial instruments',
    caption: 'Carrying amounts of financial assets and liabilities by measurement category.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Financial assets at amortised cost',
      'Financial assets at fair value through profit or loss',
      'Financial assets at fair value through other comprehensive income',
      'Financial liabilities at amortised cost',
      'Financial liabilities at fair value through profit or loss',
    ],
  };
}

function relatedPartyTable(): FrameworkTableDef {
  return {
    title: 'Related party transactions and balances',
    caption: 'Transactions and outstanding balances with related parties.',
    columns: ['Related party / nature', 'Transactions for the year', 'Outstanding balance'],
    manualRows: [
      'Holding company',
      'Fellow subsidiaries',
      'Directors and key management',
      'Entities controlled by key management',
    ],
  };
}

function keyManagementTable(): FrameworkTableDef {
  return {
    title: 'Key management remuneration',
    caption: 'Compensation of directors and key management personnel.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Short-term employee benefits',
      'Post-employment benefits',
      'Other long-term benefits',
      'Termination benefits',
      'Total',
    ],
  };
}

function provisionsTable(): FrameworkTableDef {
  return {
    title: 'Provisions',
    caption: 'Reconciliation of provisions by class.',
    columns: ['Class of provision', 'Opening balance', 'Additional / (reversed)', 'Utilised', 'Closing balance'],
    manualRows: [
      'Legal and regulatory claims',
      'Onerous contracts',
      'Restoration and decommissioning',
      'Other provisions',
    ],
  };
}

function commitmentsTable(): FrameworkTableDef {
  return {
    title: 'Commitments',
    caption: 'Capital and other commitments contracted for at the reporting date.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Capital commitments - contracted',
      'Capital commitments - authorised but not contracted',
      'Operating commitments',
    ],
  };
}

function contingenciesTable(): FrameworkTableDef {
  return {
    title: 'Contingencies',
    caption: 'Contingent liabilities and contingent assets at the reporting date.',
    columns: ['Nature', 'Contingent liability', 'Contingent asset'],
    manualRows: [
      'Guarantees and sureties issued',
      'Legal proceedings',
      'Other contingencies',
    ],
  };
}

function inventoriesTable(): FrameworkTableDef {
  return {
    title: 'Inventories',
    caption: 'Analysis of inventories by category.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Raw materials',
      'Work in progress',
      'Finished goods',
      'Merchandise',
      'Write-down to net realisable value',
      'Total',
    ],
  };
}

function employeeBenefitsTable(): FrameworkTableDef {
  return {
    title: 'Employee benefit obligations',
    caption: 'Analysis of employee benefit liabilities.',
    columns: YEAR_COLUMNS,
    manualRows: [
      'Provision for leave pay',
      'Provision for bonuses',
      'Post-employment benefit obligations',
      'Other employee benefits',
      'Total',
    ],
  };
}

// ── Public-sector table library ──────────────────────────────────────────────
function nonExchangeRevenueTable(): FrameworkTableDef {
  return {
    title: 'Revenue from non-exchange transactions',
    caption: 'Transfers, grants, taxes and other non-exchange revenue.',
    columns: YEAR_COLUMNS,
    factMappings: [
      {
        label: 'Total revenue from non-exchange transactions',
        line_code: 'perf.nonexchange_revenue',
        comparative_line_code: 'perf.nonexchange_revenue.prior',
      },
    ],
    manualRows: [
      'Government grants and subsidies',
      'Transfers from other spheres of government',
      'Taxes, levies and fines',
      'Public contributions and donations',
      'Services in kind',
    ],
  };
}

function exchangeRevenueTable(): FrameworkTableDef {
  return {
    title: 'Revenue from exchange transactions',
    caption: 'Revenue arising from exchange transactions.',
    columns: YEAR_COLUMNS,
    factMappings: [
      {
        label: 'Total revenue from exchange transactions',
        line_code: 'perf.total_revenue',
        comparative_line_code: 'perf.total_revenue.prior',
      },
    ],
    manualRows: [
      'Sale of goods',
      'Rendering of services',
      'Rental of facilities and equipment',
      'Interest, dividends and rent on land',
    ],
  };
}

function budgetComparisonTable(): FrameworkTableDef {
  return {
    title: 'Comparison of budget and actual amounts',
    caption: 'Comparison of the approved budget with actual amounts on a comparable basis.',
    columns: ['Description', 'Approved budget', 'Actual amount', 'Variance'],
    manualRows: [
      'Total revenue',
      'Total expenditure',
      'Surplus / (deficit) for the period',
    ],
  };
}

// ── Shared narrative library ─────────────────────────────────────────────────
const N = {
  basis: (fw: string) =>
    `The annual financial statements have been prepared in accordance with ${fw} and are presented in the functional and presentation currency of the entity. They have been prepared on the historical cost basis, except for financial instruments and other items measured at fair value or revalued amounts where required or elected, and are drawn up on the going concern and accrual bases of accounting.`,
  policies:
    'The principal accounting policies applied in the preparation of these annual financial statements are set out below. These policies have been applied consistently to all periods presented, unless otherwise stated, and are consistent with those applied in the previous reporting period.',
  judgements:
    'In applying the accounting policies, management is required to make judgements, estimates and assumptions that affect the reported amounts of assets, liabilities, income and expenses. These estimates and associated assumptions are based on historical experience and other factors considered reasonable in the circumstances. Actual results may differ from these estimates, which are reviewed on an ongoing basis. Significant areas of judgement and estimation include the useful lives and residual values of assets, impairment assessments, the measurement of expected credit losses, the recognition and measurement of provisions, and the recoverability of deferred tax assets.',
} as const;

// ── IFRS Accounting Policy Library ───────────────────────────────────────────
function ifrsPolicies(frameworkLabel: string): FrameworkPolicyDef[] {
  return [
    pol({
      code: 'POL.BASIS',
      title: 'Basis of preparation',
      intro: `The financial statements have been prepared in accordance with ${frameworkLabel} on the going concern basis, under the historical cost convention except where a standard requires or permits measurement at fair value, revalued amount or recoverable amount.`,
      presentation:
        'Assets and liabilities are presented as current or non-current, and income and expenses are presented by nature or function, on a consistent basis between periods.',
      standards: ['IAS 1'],
    }),
    pol({
      code: 'POL.CONSOLIDATION',
      title: 'Basis of consolidation',
      recognition:
        'Subsidiaries are entities controlled by the group; control exists when the group is exposed to, or has rights to, variable returns and has the ability to affect those returns through its power over the investee.',
      initialMeasurement:
        'The results of subsidiaries are consolidated from the date on which control is obtained and cease to be consolidated from the date on which control is lost.',
      derecognition:
        'On loss of control, any retained interest is remeasured to fair value and the resulting gain or loss is recognised in profit or loss.',
      presentation:
        'Intragroup balances, transactions and unrealised gains and losses are eliminated in full on consolidation.',
      standards: ['IFRS 10'],
    }),
    pol({
      code: 'POL.REVENUE',
      title: 'Revenue from contracts with customers',
      recognition:
        'Revenue is recognised when the entity satisfies a performance obligation by transferring control of a promised good or service to a customer, either over time or at a point in time.',
      initialMeasurement:
        'Revenue is measured at the transaction price allocated to the performance obligation, being the consideration the entity expects to be entitled to, net of value added tax, discounts, rebates and returns, and adjusted for the effects of any significant financing component and variable consideration.',
      judgements:
        'Judgement is applied in identifying performance obligations, determining whether control transfers over time or at a point in time, and estimating variable consideration.',
      standards: ['IFRS 15'],
    }),
    pol({
      code: 'POL.PPE',
      title: 'Property, plant and equipment',
      recognition:
        'An item of property, plant and equipment is recognised as an asset when it is probable that future economic benefits associated with the item will flow to the entity and its cost can be measured reliably.',
      initialMeasurement:
        'Items are measured initially at cost, comprising the purchase price, import duties, non-refundable taxes and any costs directly attributable to bringing the asset to the location and condition necessary for it to operate.',
      subsequentMeasurement:
        'After recognition, items are carried at cost less accumulated depreciation and accumulated impairment losses. Depreciation is recognised on a straight-line basis over the estimated useful life of each significant component to its residual value.',
      derecognition:
        'An item is derecognised on disposal or when no future economic benefits are expected from its use or disposal; the resulting gain or loss is recognised in profit or loss.',
      estimates:
        'Useful lives, residual values and depreciation methods are reviewed at each reporting date and adjusted prospectively where appropriate.',
      standards: ['IAS 16'],
    }),
    pol({
      code: 'POL.INTANGIBLES',
      title: 'Intangible assets',
      recognition:
        'An intangible asset is recognised when it is identifiable, the entity controls it, future economic benefits are probable and its cost can be measured reliably. Research expenditure is expensed as incurred; development expenditure is capitalised only when strict recognition criteria are met.',
      initialMeasurement: 'Intangible assets are measured initially at cost.',
      subsequentMeasurement:
        'Intangible assets with finite useful lives are carried at cost less accumulated amortisation and impairment and amortised over their useful lives; those with indefinite useful lives are not amortised but tested annually for impairment.',
      standards: ['IAS 38'],
    }),
    pol({
      code: 'POL.INVPROP',
      title: 'Investment property',
      recognition:
        'Investment property is property held to earn rentals or for capital appreciation, or both, rather than for use in the production or supply of goods or services or for administrative purposes.',
      initialMeasurement: 'Investment property is measured initially at cost, including transaction costs.',
      subsequentMeasurement:
        'Investment property is subsequently measured using the fair value model, with changes in fair value recognised in profit or loss in the period in which they arise.',
      standards: ['IAS 40'],
    }),
    pol({
      code: 'POL.LEASES',
      title: 'Leases',
      recognition:
        'At the commencement date of a lease the entity recognises a right-of-use asset and a corresponding lease liability, except for short-term leases and leases of low-value assets which are expensed on a straight-line basis.',
      initialMeasurement:
        'The lease liability is measured at the present value of the lease payments that are not paid at the commencement date, discounted using the interest rate implicit in the lease or the incremental borrowing rate. The right-of-use asset is measured at cost.',
      subsequentMeasurement:
        'The right-of-use asset is depreciated over the shorter of the lease term and the useful life of the asset, and the lease liability is increased by the finance charge and reduced by lease payments.',
      standards: ['IFRS 16'],
    }),
    pol({
      code: 'POL.FININST',
      title: 'Financial instruments',
      recognition:
        'Financial assets and financial liabilities are recognised when the entity becomes a party to the contractual provisions of the instrument.',
      initialMeasurement:
        'Financial instruments are measured initially at fair value plus, for instruments not measured at fair value through profit or loss, directly attributable transaction costs.',
      subsequentMeasurement:
        'Financial assets are subsequently measured at amortised cost, fair value through other comprehensive income, or fair value through profit or loss, based on the business model and the contractual cash flow characteristics of the asset. A loss allowance for expected credit losses is recognised on financial assets measured at amortised cost.',
      derecognition:
        'A financial asset is derecognised when the contractual rights to its cash flows expire or are transferred; a financial liability is derecognised when the obligation is discharged, cancelled or expires.',
      standards: ['IFRS 9', 'IFRS 7'],
    }),
    pol({
      code: 'POL.IMPAIRMENT',
      title: 'Impairment of non-financial assets',
      recognition:
        'At each reporting date the entity assesses whether there is any indication that a non-financial asset may be impaired; goodwill and indefinite-life intangibles are tested annually.',
      subsequentMeasurement:
        'Where an indication exists, the recoverable amount of the asset is estimated as the higher of its fair value less costs of disposal and its value in use; an impairment loss is recognised where the carrying amount exceeds the recoverable amount.',
      standards: ['IAS 36'],
    }),
    pol({
      code: 'POL.INVENTORY',
      title: 'Inventories',
      initialMeasurement:
        'Inventories are measured initially at cost, comprising all costs of purchase, costs of conversion and other costs incurred in bringing them to their present location and condition.',
      subsequentMeasurement:
        'Inventories are subsequently measured at the lower of cost and net realisable value, with cost determined on the first-in-first-out or weighted-average basis.',
      standards: ['IAS 2'],
    }),
    pol({
      code: 'POL.PROVISIONS',
      title: 'Provisions and contingencies',
      recognition:
        'A provision is recognised when the entity has a present legal or constructive obligation as a result of a past event, it is probable that an outflow of resources will be required to settle the obligation and a reliable estimate can be made of the amount.',
      initialMeasurement:
        'Provisions are measured at the best estimate of the expenditure required to settle the present obligation, discounted to present value where the effect is material.',
      standards: ['IAS 37'],
    }),
    pol({
      code: 'POL.EMPLOYEE',
      title: 'Employee benefits',
      recognition:
        'The cost of short-term employee benefits is recognised in the period in which the service is rendered; a liability is recognised for the amount expected to be paid in respect of accumulated leave and short-term bonuses.',
      subsequentMeasurement:
        'Contributions to defined contribution plans are recognised as an expense as employees render service; obligations under defined benefit plans are measured using the projected unit credit method.',
      standards: ['IAS 19'],
    }),
    pol({
      code: 'POL.TAX',
      title: 'Taxation',
      recognition:
        'Current tax is the expected tax payable or receivable on the taxable income or loss for the year, using tax rates enacted or substantively enacted at the reporting date.',
      subsequentMeasurement:
        'Deferred tax is recognised on temporary differences between the carrying amounts of assets and liabilities and their tax bases, using the liability method. A deferred tax asset is recognised only to the extent that it is probable that future taxable profit will be available against which it can be utilised.',
      standards: ['IAS 12'],
    }),
    pol({
      code: 'POL.FOREX',
      title: 'Foreign currencies',
      recognition:
        'Transactions in foreign currencies are recorded at the spot exchange rate at the date of the transaction.',
      subsequentMeasurement:
        'Monetary items denominated in foreign currencies are retranslated at the closing rate at the reporting date, with exchange differences recognised in profit or loss; non-monetary items measured at historical cost are not retranslated.',
      standards: ['IAS 21'],
    }),
    pol({
      code: 'POL.BORROWINGCOST',
      title: 'Borrowing costs',
      recognition:
        'Borrowing costs directly attributable to the acquisition, construction or production of a qualifying asset are capitalised as part of the cost of that asset; all other borrowing costs are recognised in profit or loss in the period in which they are incurred.',
      standards: ['IAS 23'],
    }),
    pol({
      code: 'POL.GRANTS',
      title: 'Government grants',
      recognition:
        'Government grants are recognised when there is reasonable assurance that the entity will comply with the conditions attaching to them and that the grants will be received.',
      subsequentMeasurement:
        'Grants are recognised in profit or loss on a systematic basis over the periods in which the entity recognises as expenses the related costs for which the grants are intended to compensate.',
      standards: ['IAS 20'],
    }),
  ];
}

// ── IFRS Disclosure / Narrative Library ──────────────────────────────────────
function ifrsNotes(): FrameworkNoteDef[] {
  return [
    {
      code: 'DISC.GENERAL',
      title: 'General information',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Describes the reporting entity, its domicile, legal form and principal activities.',
      narrative:
        'The entity is incorporated and domiciled in its country of registration. These annual financial statements present the financial position, financial performance and cash flows of the entity for the reporting period, and were authorised for issue by the directors.',
      standards: ['IAS 1'],
    },
    {
      code: 'DISC.BASIS',
      title: 'Basis of preparation',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'States the reporting framework, measurement basis and going concern assumption.',
      narrative: N.basis('International Financial Reporting Standards (IFRS)'),
      crossReferences: ['DISC.POLICIES'],
      standards: ['IAS 1'],
    },
    {
      code: 'DISC.POLICIES',
      title: 'Significant accounting policies',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Sets out the measurement bases and accounting policies applied.',
      narrative: N.policies,
      standards: ['IAS 1', 'IAS 8'],
    },
    {
      code: 'DISC.JUDGEMENTS',
      title: 'Significant judgements and sources of estimation uncertainty',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses the judgements and key assumptions with a significant risk of material adjustment.',
      narrative: N.judgements,
      dependencies: ['DISC.POLICIES'],
      standards: ['IAS 1'],
    },
    {
      code: 'DISC.REVENUE',
      title: 'Revenue',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Disaggregates revenue from contracts with customers.',
      narrative:
        'Revenue represents the transfer of promised goods and services to customers in the ordinary course of business, measured at the transaction price net of value added tax, discounts and returns. Revenue is disaggregated below by major category and timing of transfer.',
      table: revenueDisaggregationTable(),
      dependencies: ['POL.REVENUE'],
      standards: ['IFRS 15'],
    },
    {
      code: 'DISC.PPE',
      title: 'Property, plant and equipment',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Reconciles the carrying amount of each class of property, plant and equipment.',
      narrative:
        'The carrying amount of property, plant and equipment is reconciled below. Additions, disposals and the depreciation charge for the year are recorded in the fixed asset register and agreed to that register.',
      table: ppeRollforwardTable(),
      crossReferences: ['DISC.POLICIES'],
      dependencies: ['POL.PPE'],
      standards: ['IAS 16'],
    },
    {
      code: 'DISC.INTANGIBLES',
      title: 'Intangible assets',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasIntangibleAssets',
      purpose: 'Reconciles the carrying amount of intangible assets.',
      narrative:
        'Intangible assets comprise separately acquired and internally generated assets that are identifiable and controlled by the entity. The carrying amount is reconciled below.',
      table: intangiblesRollforwardTable(),
      dependencies: ['POL.INTANGIBLES'],
      standards: ['IAS 38'],
    },
    {
      code: 'DISC.INVPROP',
      title: 'Investment property',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasInvestmentProperty',
      purpose: 'Reconciles the carrying amount of investment property measured at fair value.',
      narrative:
        'Investment property is held to earn rentals or for capital appreciation and is measured at fair value, with fair value adjustments recognised in profit or loss.',
      table: investmentPropertyTable(),
      dependencies: ['POL.INVPROP'],
      standards: ['IAS 40'],
    },
    {
      code: 'DISC.INVENTORIES',
      title: 'Inventories',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasInventories',
      purpose: 'Analyses inventories by category and discloses write-downs.',
      narrative:
        'Inventories are measured at the lower of cost and net realisable value. The carrying amount by category, and any write-down to net realisable value recognised as an expense, is set out below.',
      table: inventoriesTable(),
      dependencies: ['POL.INVENTORY'],
      standards: ['IAS 2'],
    },
    {
      code: 'DISC.RECEIVABLES',
      title: 'Trade and other receivables',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasReceivables',
      purpose: 'Discloses the ageing and expected credit loss allowance on receivables.',
      narrative:
        'Trade and other receivables are measured at amortised cost less a loss allowance for expected credit losses. The ageing of receivables and the associated loss allowance are set out below.',
      table: receivablesAgeingTable(),
      dependencies: ['POL.FININST'],
      standards: ['IFRS 7', 'IFRS 9'],
    },
    {
      code: 'DISC.PAYABLES',
      title: 'Trade and other payables',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasPayables',
      purpose: 'Analyses trade and other payables.',
      narrative:
        'Trade and other payables are measured at amortised cost and are analysed by class below.',
      table: payablesTable(),
      standards: ['IFRS 7'],
    },
    {
      code: 'DISC.FININST',
      title: 'Financial instruments and risk management',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasFinancialInstruments',
      purpose: 'Discloses the categories of financial instruments and financial risk exposures.',
      narratives: [
        'The entity is exposed to credit risk, liquidity risk and market risk arising from its financial instruments. Financial risk management is carried out under policies approved by those charged with governance.',
        'The carrying amounts of financial assets and liabilities by measurement category are set out below.',
      ],
      table: financialInstrumentCategoriesTable(),
      dependencies: ['POL.FININST'],
      standards: ['IFRS 7', 'IFRS 9', 'IFRS 13'],
    },
    {
      code: 'DISC.LEASES',
      title: 'Leases',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasLeases',
      purpose: 'Discloses right-of-use assets and the maturity of lease liabilities.',
      narrative:
        'The entity leases assets under contracts that convey the right to control the use of an identified asset for a period of time in exchange for consideration. Right-of-use assets and lease liabilities are recognised at the commencement date, and the maturity of lease liabilities is set out below.',
      table: leaseMaturityTable(),
      dependencies: ['POL.LEASES'],
      standards: ['IFRS 16'],
    },
    {
      code: 'DISC.BORROWINGS',
      title: 'Borrowings',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasBorrowings',
      purpose: 'Analyses borrowings by class, security and maturity.',
      narrative:
        'Borrowings are measured at amortised cost using the effective interest method. The analysis of borrowings, including secured and unsecured facilities and their current and non-current portions, is set out below.',
      table: borrowingsTable(),
      standards: ['IFRS 7', 'IFRS 9'],
    },
    {
      code: 'DISC.PROVISIONS',
      title: 'Provisions',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasProvisions',
      purpose: 'Reconciles provisions by class and describes the related uncertainties.',
      narrative:
        'Provisions are recognised where the entity has a present obligation as a result of a past event, an outflow of resources is probable and a reliable estimate can be made. Movements in provisions by class are set out below.',
      table: provisionsTable(),
      dependencies: ['POL.PROVISIONS'],
      standards: ['IAS 37'],
    },
    {
      code: 'DISC.EMPLOYEE',
      title: 'Employee benefit obligations',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasEmployeeBenefits',
      purpose: 'Discloses employee benefit liabilities and related obligations.',
      narrative:
        'Employee benefit obligations comprise short-term benefits, including accumulated leave and bonuses, and post-employment benefits. The analysis of employee benefit liabilities is set out below.',
      table: employeeBenefitsTable(),
      dependencies: ['POL.EMPLOYEE'],
      standards: ['IAS 19'],
    },
    {
      code: 'DISC.TAX',
      title: 'Taxation',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Reconciles the tax expense to the accounting profit at the standard rate.',
      narrative:
        'The taxation charge comprises current and deferred taxation. A reconciliation of the tax expense to the amount that would arise using the standard rate of taxation is set out below.',
      table: taxReconciliationTable(),
      dependencies: ['POL.TAX'],
      standards: ['IAS 12'],
    },
    {
      code: 'DISC.DEFERREDTAX',
      title: 'Deferred taxation',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasDeferredTax',
      purpose: 'Analyses deferred tax by temporary difference.',
      narrative:
        'Deferred taxation arises from temporary differences between the carrying amounts of assets and liabilities and their tax bases. The composition of the net deferred tax balance is set out below.',
      table: deferredTaxTable(),
      dependencies: ['POL.TAX'],
      standards: ['IAS 12'],
    },
    {
      code: 'DISC.SHARECAPITAL',
      title: 'Share capital',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasShareCapital',
      purpose: 'Discloses authorised and issued share capital and movements therein.',
      narrative:
        'The authorised and issued share capital of the entity, and any movements during the year, are set out below.',
      table: shareCapitalTable(),
      standards: ['IAS 1'],
    },
    {
      code: 'DISC.CASHFLOW',
      title: 'Notes to the statement of cash flows',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasCashFlowReconciliation',
      purpose: 'Reconciles profit or loss to cash generated from operations.',
      narrative:
        'Cash generated from operations is reconciled to profit or loss before taxation by adjusting for non-cash items and movements in working capital, as set out below.',
      table: cashFlowReconciliationTable(),
      standards: ['IAS 7'],
    },
    {
      code: 'DISC.RELATED',
      title: 'Related parties',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses related party relationships, transactions, balances and key management remuneration.',
      narratives: [
        'Related party relationships exist between the entity and its holding company, fellow subsidiaries, directors and key management personnel, and entities controlled by them. Transactions with related parties are concluded in the ordinary course of business.',
        'Transactions and outstanding balances with related parties, and the remuneration of key management personnel, are set out below.',
      ],
      tables: [relatedPartyTable(), keyManagementTable()],
      standards: ['IAS 24'],
    },
    {
      code: 'DISC.COMMITMENTS',
      title: 'Commitments',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasCommitments',
      purpose: 'Discloses capital and other commitments contracted for at the reporting date.',
      narrative:
        'Capital and other commitments contracted for at the reporting date, but not yet recognised in the financial statements, are set out below.',
      table: commitmentsTable(),
      standards: ['IAS 16'],
    },
    {
      code: 'DISC.CONTINGENT',
      title: 'Contingencies',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasContingencies',
      purpose: 'Discloses contingent liabilities and contingent assets.',
      narrative:
        'Contingent liabilities represent possible obligations arising from past events whose existence will be confirmed only by uncertain future events, and present obligations that are not recognised because an outflow is not probable or cannot be measured reliably. Contingent assets are disclosed where an inflow of economic benefits is probable.',
      table: contingenciesTable(),
      standards: ['IAS 37'],
    },
    {
      code: 'DISC.EVENTS',
      title: 'Events after the reporting period',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses adjusting and non-adjusting events after the reporting period.',
      narrative:
        'The entity evaluates events occurring between the reporting date and the date of authorisation for issue. Adjusting events are reflected in the financial statements, and material non-adjusting events are disclosed. The directors are not aware of any matter or circumstance arising since the reporting date, not otherwise dealt with, that would materially affect the financial statements.',
      standards: ['IAS 10'],
    },
    {
      code: 'DISC.GOINGCONCERN',
      title: 'Going concern',
      requirement: 'optional',
      disclosureClass: 'optional',
      conditionKey: 'goingConcernUncertainty',
      purpose: 'Discloses material uncertainties relating to the going concern assumption.',
      narrative:
        'The financial statements have been prepared on the going concern basis. Where material uncertainties relating to events or conditions may cast significant doubt on the ability of the entity to continue as a going concern, the nature of those uncertainties and the basis on which the going concern assumption remains appropriate are disclosed.',
      standards: ['IAS 1'],
    },
  ];
}

// ── IFRS extension points (industry) ─────────────────────────────────────────
function ifrsExtensionPoints(): FrameworkExtensionPoint[] {
  return [
    {
      code: 'EXT.AGRICULTURE',
      title: 'Agriculture',
      description: 'Biological assets and agricultural produce measured at fair value less costs to sell.',
      conditionKey: 'industryAgriculture',
      notes: [
        {
          code: 'DISC.BIOLOGICAL',
          title: 'Biological assets',
          requirement: 'optional',
          disclosureClass: 'conditional',
          conditionKey: 'industryAgriculture',
          purpose: 'Reconciles biological assets measured at fair value less costs to sell.',
          narrative:
            'Biological assets are measured at fair value less costs to sell, with changes recognised in profit or loss. The reconciliation of the carrying amount of biological assets is set out below.',
          table: {
            title: 'Biological assets',
            columns: YEAR_COLUMNS,
            manualRows: [
              'Fair value at the beginning of the year',
              'Increases due to purchases and births',
              'Decreases due to sales and harvest',
              'Fair value adjustments',
              'Fair value at the end of the year',
            ],
          },
          standards: ['IAS 41'],
        },
      ],
    },
    {
      code: 'EXT.EXTRACTIVE',
      title: 'Extractive activities',
      description: 'Exploration and evaluation assets in the extractive industries.',
      conditionKey: 'industryExtractive',
    },
    {
      code: 'EXT.FINANCIAL_SERVICES',
      title: 'Financial services',
      description: 'Additional disclosures for regulated financial-services entities.',
      conditionKey: 'industryFinancialServices',
    },
  ];
}

// ── IFRS for SMEs library (V14.3 completeness pack) ──────────────────────────
function ifrsForSmePolicies(): FrameworkPolicyDef[] {
  return buildIfrsForSmePolicies();
}

function ifrsForSmeNotes(): FrameworkNoteDef[] {
  return buildIfrsForSmeNotes();
}

// ── Public-sector Accounting Policy Library (GRAP / IPSAS) ────────────────────
function publicSectorPolicies(frameworkLabel: string): FrameworkPolicyDef[] {
  return [
    pol({
      code: 'POL.BASIS',
      title: 'Basis of preparation',
      intro: `The annual financial statements have been prepared in accordance with ${frameworkLabel} on the accrual basis of accounting and the historical cost convention, except where a standard requires or permits measurement at fair value or another basis.`,
      presentation:
        'The financial statements are presented in the functional and presentation currency of the entity, and comparative information is presented for the preceding reporting period.',
    }),
    pol({
      code: 'POL.REVENUE_NONEXCHANGE',
      title: 'Revenue from non-exchange transactions',
      recognition:
        'Revenue from non-exchange transactions, comprising transfers, grants, taxes, fines and donations, is recognised when it is probable that the future economic benefits or service potential will flow to the entity, the amount can be measured reliably and any present obligation arising from conditions attached to the transfer has been satisfied.',
      initialMeasurement:
        'Non-exchange revenue is measured at the fair value of the asset recognised, and a liability is recognised to the extent that conditions attached to the transfer have not yet been met.',
    }),
    pol({
      code: 'POL.REVENUE_EXCHANGE',
      title: 'Revenue from exchange transactions',
      recognition:
        'Revenue from exchange transactions is recognised when the significant risks and rewards of ownership, or control, have transferred to the purchaser, the amount can be measured reliably and it is probable that the economic benefits will flow to the entity.',
      initialMeasurement:
        'Exchange revenue is measured at the fair value of the consideration received or receivable, net of trade discounts and value added tax.',
    }),
    pol({
      code: 'POL.PPE',
      title: 'Property, plant and equipment',
      recognition:
        'Property, plant and equipment is recognised as an asset when it is probable that future economic benefits or service potential associated with the item will flow to the entity and the cost or fair value can be measured reliably.',
      initialMeasurement:
        'Items are measured initially at cost, or, where acquired through a non-exchange transaction, at fair value at the date of acquisition.',
      subsequentMeasurement:
        'Items are subsequently carried at cost or revalued amount less accumulated depreciation and accumulated impairment losses, and depreciated on a straight-line basis over their estimated useful lives.',
      estimates:
        'Useful lives and residual values are reviewed at each reporting date and adjusted prospectively where appropriate.',
    }),
    pol({
      code: 'POL.HERITAGE',
      title: 'Heritage assets',
      recognition:
        'Heritage assets are assets that have cultural, environmental, historical, natural, scientific, technological or artistic significance and are held indefinitely for the benefit of present and future generations.',
      subsequentMeasurement:
        'Heritage assets are measured at cost or, where acquired through a non-exchange transaction, at fair value at the date of acquisition, and are not depreciated where their useful lives are indefinite.',
    }),
    pol({
      code: 'POL.IMPAIRMENT',
      title: 'Impairment of assets',
      recognition:
        'At each reporting date the entity assesses whether there is an indication that a cash-generating or non-cash-generating asset may be impaired.',
      subsequentMeasurement:
        'For non-cash-generating assets, the recoverable service amount is determined; an impairment loss is recognised where the carrying amount exceeds the recoverable service amount.',
    }),
    pol({
      code: 'POL.PROVISIONS',
      title: 'Provisions and contingencies',
      recognition:
        'A provision is recognised when the entity has a present legal or constructive obligation as a result of a past event, an outflow of resources embodying economic benefits or service potential is probable and a reliable estimate can be made.',
      initialMeasurement:
        'Provisions are measured at the best estimate of the expenditure required to settle the obligation, discounted to present value where material.',
    }),
    pol({
      code: 'POL.EMPLOYEE',
      title: 'Employee benefits',
      recognition:
        'Short-term employee benefits are recognised as an expense in the period in which the related service is rendered.',
      subsequentMeasurement:
        'Obligations for contributions to defined contribution plans are recognised as an expense as service is rendered; defined benefit obligations are measured using the projected unit credit method.',
    }),
    pol({
      code: 'POL.FININST',
      title: 'Financial instruments',
      recognition:
        'Financial instruments are recognised when the entity becomes a party to the contractual provisions of the instrument.',
      initialMeasurement:
        'Financial instruments are measured initially at fair value plus, where applicable, directly attributable transaction costs.',
      subsequentMeasurement:
        'Financial instruments are subsequently measured at amortised cost, cost or fair value depending on their classification, and financial assets are assessed for impairment at each reporting date.',
    }),
    pol({
      code: 'POL.BUDGET',
      title: 'Budget information',
      presentation:
        'The approved budget is prepared on a basis consistent with the accounting policies adopted for the financial statements, or, where prepared on a different basis, a reconciliation between the two bases is presented. A comparison of budgeted and actual amounts is presented for the entity where the budget is made publicly available.',
    }),
  ];
}

// ── Public-sector Disclosure / Narrative Library (GRAP / IPSAS) ───────────────
function publicSectorNotes(frameworkLabel: string): FrameworkNoteDef[] {
  return [
    {
      code: 'DISC.GENERAL',
      title: 'General information',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Describes the reporting entity, its mandate and principal activities.',
      narrative:
        'The entity is a public-sector entity established in terms of the applicable legislation. These annual financial statements present the financial position, financial performance and cash flows of the entity in respect of the reporting period, in the discharge of its mandate.',
    },
    {
      code: 'DISC.BASIS',
      title: 'Basis of preparation',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'States the reporting framework and the accrual basis of accounting.',
      narrative: N.basis(frameworkLabel),
      crossReferences: ['DISC.POLICIES'],
    },
    {
      code: 'DISC.POLICIES',
      title: 'Significant accounting policies',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Sets out the measurement bases and accounting policies applied.',
      narrative: N.policies,
    },
    {
      code: 'DISC.JUDGEMENTS',
      title: 'Significant judgements and sources of estimation uncertainty',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses judgements and key assumptions with a significant risk of material adjustment.',
      narrative: N.judgements,
      dependencies: ['DISC.POLICIES'],
    },
    {
      code: 'DISC.REVENUE_NONEXCHANGE',
      title: 'Revenue from non-exchange transactions',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses transfers, grants, taxes and other non-exchange revenue.',
      narrative:
        'Revenue from non-exchange transactions comprises transfers, grants, taxes, fines and donations received without directly giving approximately equal value in exchange. The composition of non-exchange revenue is set out below.',
      table: nonExchangeRevenueTable(),
      dependencies: ['POL.REVENUE_NONEXCHANGE'],
    },
    {
      code: 'DISC.REVENUE_EXCHANGE',
      title: 'Revenue from exchange transactions',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses revenue arising from exchange transactions.',
      narrative:
        'Revenue from exchange transactions is recognised when the entity provides goods or services in exchange for approximately equal value. The composition of exchange revenue is set out below.',
      table: exchangeRevenueTable(),
      dependencies: ['POL.REVENUE_EXCHANGE'],
    },
    {
      code: 'DISC.PPE',
      title: 'Property, plant and equipment',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Reconciles the carrying amount of each class of property, plant and equipment.',
      narrative:
        'The carrying amount of property, plant and equipment is reconciled below. Additions, disposals and the depreciation charge for the year are recorded in the asset register and completed against that register.',
      table: ppeRollforwardTable(),
      dependencies: ['POL.PPE'],
    },
    {
      code: 'DISC.HERITAGE',
      title: 'Heritage assets',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasHeritageAssets',
      purpose: 'Reconciles the carrying amount of heritage assets.',
      narrative:
        'Heritage assets are held for their cultural, historical or environmental significance for the benefit of present and future generations. The carrying amount of heritage assets is reconciled below.',
      table: {
        title: 'Heritage assets',
        columns: YEAR_COLUMNS,
        manualRows: [
          'Carrying amount at the beginning of the year',
          'Additions',
          'Disposals',
          'Impairment losses',
          'Carrying amount at the end of the year',
        ],
      },
      dependencies: ['POL.HERITAGE'],
    },
    {
      code: 'DISC.RECEIVABLES',
      title: 'Receivables',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasReceivables',
      purpose: 'Discloses receivables from exchange and non-exchange transactions with impairment.',
      narrative:
        'Receivables from exchange and non-exchange transactions are measured at amortised cost less an allowance for impairment. The ageing of receivables and the allowance for impairment are set out below.',
      table: receivablesAgeingTable(),
    },
    {
      code: 'DISC.PAYABLES',
      title: 'Payables',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasPayables',
      purpose: 'Analyses payables from exchange and non-exchange transactions.',
      narrative:
        'Payables from exchange and non-exchange transactions are measured at amortised cost and are analysed by class below.',
      table: payablesTable(),
    },
    {
      code: 'DISC.PROVISIONS',
      title: 'Provisions',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasProvisions',
      purpose: 'Reconciles provisions by class.',
      narrative:
        'Provisions are recognised where the entity has a present obligation as a result of a past event, an outflow of resources is probable and a reliable estimate can be made. Movements in provisions by class are set out below.',
      table: provisionsTable(),
      dependencies: ['POL.PROVISIONS'],
    },
    {
      code: 'DISC.EMPLOYEE',
      title: 'Employee benefit obligations',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasEmployeeBenefits',
      purpose: 'Discloses employee benefit liabilities.',
      narrative:
        'Employee benefit obligations comprise short-term benefits, including accumulated leave and bonuses, and post-employment benefits. The analysis of employee benefit liabilities is set out below.',
      table: employeeBenefitsTable(),
      dependencies: ['POL.EMPLOYEE'],
    },
    {
      code: 'DISC.RELATED',
      title: 'Related parties',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses related party relationships, transactions and key management remuneration.',
      narratives: [
        'Related parties include entities within the same sphere or level of government, controlled and associated entities, and the entity accounting officer, senior management and members of the governing body. Transactions with related parties are concluded within a normal supplier or client relationship on terms no more or less favourable than those available to unrelated parties.',
        'Related party transactions and the remuneration of the governing body and key management personnel are set out below.',
      ],
      tables: [relatedPartyTable(), keyManagementTable()],
    },
    {
      code: 'DISC.COMMITMENTS',
      title: 'Commitments',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasCommitments',
      purpose: 'Discloses capital and other commitments at the reporting date.',
      narrative:
        'Capital and other commitments contracted for at the reporting date, but not yet recognised in the financial statements, are set out below.',
      table: commitmentsTable(),
    },
    {
      code: 'DISC.CONTINGENT',
      title: 'Contingencies',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasContingencies',
      purpose: 'Discloses contingent liabilities and contingent assets.',
      narrative:
        'Contingent liabilities represent possible obligations arising from past events whose existence will be confirmed only by uncertain future events, and present obligations that are not recognised because an outflow is not probable or cannot be measured reliably. Contingent assets are disclosed where an inflow of service potential or economic benefits is probable.',
      table: contingenciesTable(),
    },
    {
      code: 'DISC.EVENTS',
      title: 'Events after the reporting date',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses adjusting and non-adjusting events after the reporting date.',
      narrative:
        'Events after the reporting date are evaluated up to the date on which the financial statements are authorised for issue. Adjusting events are reflected in the financial statements and material non-adjusting events are disclosed.',
    },
    {
      code: 'DISC.BUDGET',
      title: 'Comparison with approved budget',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasApprovedBudget',
      purpose: 'Compares actual amounts with the approved budget on a comparable basis.',
      narrative:
        'A comparison of actual amounts with the approved budget is presented where the entity makes its approved budget publicly available. Material variances between the budget and actual amounts are explained.',
      table: budgetComparisonTable(),
      dependencies: ['POL.BUDGET'],
    },
    {
      code: 'DISC.GOINGCONCERN',
      title: 'Going concern',
      requirement: 'optional',
      disclosureClass: 'optional',
      conditionKey: 'goingConcernUncertainty',
      purpose: 'Discloses material uncertainties relating to the going concern assumption.',
      narrative:
        'The financial statements have been prepared on the going concern basis. Where material uncertainties relating to events or conditions may cast significant doubt on the ability of the entity to continue as a going concern, the nature of those uncertainties is disclosed.',
    },
  ];
}

function publicSectorExtensionPoints(): FrameworkExtensionPoint[] {
  return [
    {
      code: 'EXT.MUNICIPAL',
      title: 'Municipalities',
      description: 'Distribution losses, conditional grants and service delivery disclosures for municipalities.',
      conditionKey: 'industryMunicipality',
    },
    {
      code: 'EXT.STATUTORY_BODY',
      title: 'Statutory bodies and public entities',
      description: 'Additional disclosures for constitutional institutions and public entities.',
      conditionKey: 'industryStatutoryBody',
    },
  ];
}

// ── Framework assembly ───────────────────────────────────────────────────────
const IFRS_DEFINITION: FrameworkDefinition = deepFreeze({
  key: 'IFRS',
  label: 'International Financial Reporting Standards (IFRS)',
  scope:
    'Applied by entities with public accountability and other entities that elect or are required to apply full IFRS.',
  statements: PRIVATE_SECTOR_STATEMENTS,
  policies: ifrsPolicies('International Financial Reporting Standards (IFRS)'),
  notes: ifrsNotes(),
  extensionPoints: ifrsExtensionPoints(),
});

const IFRS_SME_DEFINITION: FrameworkDefinition = deepFreeze({
  key: 'IFRS_SME',
  label: 'IFRS for SMEs',
  scope:
    'Applied by entities without public accountability that publish general purpose financial statements for external users.',
  statements: PRIVATE_SECTOR_STATEMENTS,
  policies: ifrsForSmePolicies(),
  notes: ifrsForSmeNotes(),
  extensionPoints: ifrsForSmeExtensionPoints(),
});

const GRAP_DEFINITION: FrameworkDefinition = deepFreeze({
  key: 'GRAP',
  label: 'Generally Recognised Accounting Practice (GRAP)',
  scope:
    'Applied by public-sector entities, including municipalities, municipal entities and public entities, in the discharge of their mandates.',
  statements: PUBLIC_SECTOR_STATEMENTS,
  policies: publicSectorPolicies('Generally Recognised Accounting Practice (GRAP)'),
  notes: publicSectorNotes('Generally Recognised Accounting Practice (GRAP)'),
  extensionPoints: publicSectorExtensionPoints(),
});

const IPSAS_DEFINITION: FrameworkDefinition = deepFreeze({
  key: 'IPSAS',
  label: 'International Public Sector Accounting Standards (IPSAS)',
  scope:
    'Applied by public-sector entities other than Government Business Enterprises that adopt the accrual basis of accounting.',
  statements: PUBLIC_SECTOR_STATEMENTS,
  policies: publicSectorPolicies('International Public Sector Accounting Standards (IPSAS)'),
  notes: publicSectorNotes('International Public Sector Accounting Standards (IPSAS)'),
  extensionPoints: publicSectorExtensionPoints(),
});

/** Raw pack definitions before Knowledge Repository metadata enrichment. */
export const RAW_PACK_DEFINITIONS: Record<FrameworkKey, FrameworkDefinition> = deepFreeze({
  IFRS: IFRS_DEFINITION,
  IFRS_SME: IFRS_SME_DEFINITION,
  GRAP: GRAP_DEFINITION,
  IPSAS: IPSAS_DEFINITION,
});
