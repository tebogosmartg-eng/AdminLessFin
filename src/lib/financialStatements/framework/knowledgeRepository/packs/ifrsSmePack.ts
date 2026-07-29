/**
 * IFRS for SMEs Knowledge Pack — completeness content (V14.3).
 *
 * Authoritative SME-aligned policies and disclosures for the locked Knowledge
 * Repository. Section references follow the IFRS for SMEs Standard (Sections 1–35).
 * Full IFRS content remains untouched in contentLibrary.ts.
 */
import type {
  FrameworkNoteDef,
  FrameworkPolicyDef,
  FrameworkTableDef,
} from '../types';
import { pol } from '../compose';

const YEAR = ['Description', 'Current year', 'Prior year'];
const S = (n: number | string) => `IFRS for SMEs Section ${n}`;

function map(
  label: string,
  line_code: string,
  comparative_line_code?: string,
): { label: string; line_code: string; comparative_line_code?: string } {
  return { label, line_code, comparative_line_code: comparative_line_code || `${line_code}.prior` };
}

// ── SME table library (with Trial Balance fact mappings) ─────────────────────

function smePpeTable(): FrameworkTableDef {
  return {
    title: 'Property, plant and equipment',
    caption: 'Reconciliation of the carrying amount of property, plant and equipment.',
    columns: YEAR,
    factMappings: [
      map('Carrying amount at the end of the year', 'sfp.ppe'),
      map('Depreciation charge for the year', 'perf.depreciation'),
    ],
    manualRows: [
      'Cost at the beginning of the year',
      'Additions',
      'Disposals at cost',
      'Cost at the end of the year',
      'Accumulated depreciation and impairment at the beginning of the year',
      'Accumulated depreciation on disposals',
      'Impairment losses recognised',
      'Accumulated depreciation and impairment at the end of the year',
    ],
  };
}

function smeIntangiblesTable(): FrameworkTableDef {
  return {
    title: 'Intangible assets',
    caption: 'Reconciliation of the carrying amount of intangible assets other than goodwill.',
    columns: YEAR,
    factMappings: [map('Carrying amount at the end of the year', 'sfp.intangibles')],
    manualRows: [
      'Cost at the beginning of the year',
      'Additions — separately acquired',
      'Additions — internally generated',
      'Disposals',
      'Amortisation charge for the year',
      'Impairment losses recognised',
      'Carrying amount at the beginning of the year',
    ],
  };
}

function smeInvPropTable(): FrameworkTableDef {
  return {
    title: 'Investment property',
    caption: 'Reconciliation of the carrying amount of investment property.',
    columns: YEAR,
    factMappings: [map('Carrying amount at the end of the year', 'sfp.investment_property')],
    manualRows: [
      'Fair value / carrying amount at the beginning of the year',
      'Additions',
      'Disposals',
      'Transfers to or from property, plant and equipment',
      'Fair value adjustments recognised in profit or loss',
      'Depreciation (cost model)',
    ],
  };
}

function smeRevenueTable(): FrameworkTableDef {
  return {
    title: 'Revenue',
    caption: 'Analysis of revenue recognised during the period.',
    columns: YEAR,
    factMappings: [map('Total revenue', 'perf.total_revenue')],
    manualRows: [
      'Sale of goods',
      'Rendering of services',
      'Construction contracts',
      'Interest and similar income',
      'Royalties and licences',
      'Dividends',
      'Other revenue',
    ],
  };
}

function smeInventoriesTable(): FrameworkTableDef {
  return {
    title: 'Inventories',
    caption: 'Carrying amount of inventories by category.',
    columns: YEAR,
    factMappings: [map('Total inventories', 'sfp.inventories')],
    manualRows: [
      'Raw materials',
      'Work in progress',
      'Finished goods',
      'Merchandise',
      'Write-down to net realisable value recognised as an expense',
    ],
  };
}

function smeReceivablesTable(): FrameworkTableDef {
  return {
    title: 'Trade and other receivables',
    caption: 'Analysis of trade and other receivables.',
    columns: YEAR,
    factMappings: [map('Total trade and other receivables', 'sfp.receivables')],
    manualRows: [
      'Trade receivables — gross',
      'Allowance for impairment',
      'Other receivables',
      'Prepayments',
    ],
  };
}

function smePayablesTable(): FrameworkTableDef {
  return {
    title: 'Trade and other payables',
    caption: 'Analysis of trade and other payables.',
    columns: YEAR,
    factMappings: [map('Total trade and other payables', 'sfp.payables')],
    manualRows: ['Trade payables', 'Value added tax', 'Accruals', 'Amounts received in advance', 'Other payables'],
  };
}

function smeFinInstTable(): FrameworkTableDef {
  return {
    title: 'Categories of financial instruments',
    caption: 'Carrying amounts of financial assets and financial liabilities by category.',
    columns: YEAR,
    factMappings: [
      map('Trade and other receivables', 'sfp.receivables'),
      map('Cash and cash equivalents', 'sfp.cash'),
      map('Trade and other payables', 'sfp.payables'),
      map('Borrowings', 'sfp.borrowings'),
    ],
    manualRows: [
      'Basic financial assets at amortised cost — other',
      'Financial assets at fair value through profit or loss',
      'Basic financial liabilities at amortised cost — other',
      'Financial liabilities at fair value through profit or loss',
    ],
  };
}

function smeLeaseTable(): FrameworkTableDef {
  return {
    title: 'Lease commitments',
    caption: 'Future minimum lease payments under non-cancellable leases.',
    columns: YEAR,
    factMappings: [map('Lease liabilities recognised', 'sfp.leases')],
    manualRows: [
      'Finance leases — not later than one year',
      'Finance leases — later than one year and not later than five years',
      'Finance leases — later than five years',
      'Operating leases — not later than one year',
      'Operating leases — later than one year and not later than five years',
      'Operating leases — later than five years',
    ],
  };
}

function smeBorrowingsTable(): FrameworkTableDef {
  return {
    title: 'Borrowings',
    caption: 'Analysis of borrowings by class and maturity.',
    columns: YEAR,
    factMappings: [map('Total borrowings', 'sfp.borrowings')],
    manualRows: [
      'Secured loans',
      'Unsecured loans',
      'Bank overdrafts',
      'Current portion',
      'Non-current portion',
    ],
  };
}

function smeProvisionsTable(): FrameworkTableDef {
  return {
    title: 'Provisions',
    caption: 'Movements in provisions by class.',
    columns: ['Class of provision', 'Opening balance', 'Additional / (reversed)', 'Utilised', 'Closing balance'],
    factMappings: [map('Total provisions (closing)', 'sfp.provisions')],
    manualRows: ['Legal claims', 'Onerous contracts', 'Warranty obligations', 'Other provisions'],
  };
}

function smeEmployeeTable(): FrameworkTableDef {
  return {
    title: 'Employee benefit obligations',
    caption: 'Analysis of employee benefit liabilities.',
    columns: YEAR,
    factMappings: [map('Total employee benefit obligations', 'sfp.employee_benefits')],
    manualRows: [
      'Short-term employee benefits (including leave pay and bonuses)',
      'Defined contribution obligations payable',
      'Defined benefit obligations',
      'Other long-term employee benefits',
      'Termination benefits',
    ],
  };
}

function smeTaxTable(): FrameworkTableDef {
  return {
    title: 'Tax expense reconciliation',
    caption: 'Reconciliation of the tax expense to the accounting profit at the applicable tax rate.',
    columns: YEAR,
    factMappings: [
      map('Profit / (loss) before tax', 'perf.profit_before_tax'),
      map('Tax expense / (income)', 'perf.tax_expense'),
    ],
    manualRows: [
      'Tax at the applicable rate',
      'Non-deductible expenses',
      'Exempt income',
      'Temporary differences',
      'Tax losses utilised / (not recognised)',
    ],
  };
}

function smeShareCapitalTable(): FrameworkTableDef {
  return {
    title: 'Share capital',
    caption: 'Authorised and issued share capital.',
    columns: YEAR,
    factMappings: [map('Issued share capital', 'sfp.share_capital')],
    manualRows: ['Authorised share capital — number and nominal amount', 'Share premium', 'Shares issued during the year', 'Shares redeemed during the year'],
  };
}

function smeCashFlowTable(): FrameworkTableDef {
  return {
    title: 'Reconciliation of profit to cash generated from operations',
    caption: 'Non-cash adjustments and working capital movements.',
    columns: YEAR,
    factMappings: [
      map('Cash flows from operating activities', 'cf.operating'),
      map('Cash flows from investing activities', 'cf.investing'),
      map('Cash flows from financing activities', 'cf.financing'),
    ],
    manualRows: [
      'Profit / (loss) before taxation',
      'Depreciation and amortisation',
      'Finance costs',
      'Movements in working capital',
      'Cash generated from operations',
    ],
  };
}

function smeRelatedTable(): FrameworkTableDef {
  return {
    title: 'Related party transactions and balances',
    caption: 'Transactions and outstanding balances with related parties.',
    columns: ['Related party / nature', 'Transactions for the year', 'Outstanding balance'],
    manualRows: [
      'Parent / holding company',
      'Subsidiaries and fellow subsidiaries',
      'Associates and joint ventures',
      'Key management personnel',
      'Other related parties',
    ],
  };
}

function smeKmpTable(): FrameworkTableDef {
  return {
    title: 'Key management personnel compensation',
    caption: 'Compensation of key management personnel.',
    columns: YEAR,
    manualRows: [
      'Short-term employee benefits',
      'Post-employment benefits',
      'Other long-term benefits',
      'Termination benefits',
      'Share-based payment',
      'Total',
    ],
  };
}

function smeAssociatesTable(): FrameworkTableDef {
  return {
    title: 'Investments in associates',
    caption: 'Carrying amount of investments in associates.',
    columns: YEAR,
    factMappings: [map('Investments in associates', 'sfp.associates')],
    manualRows: ['Cost of investment', 'Share of post-acquisition reserves', 'Impairment', 'Dividends received'],
  };
}

function smeJointVenturesTable(): FrameworkTableDef {
  return {
    title: 'Investments in joint ventures',
    caption: 'Carrying amount of interests in joint ventures.',
    columns: YEAR,
    factMappings: [map('Investments in joint ventures', 'sfp.joint_ventures')],
    manualRows: ['Cost of investment', 'Share of post-acquisition reserves', 'Impairment'],
  };
}

function smeGoodwillTable(): FrameworkTableDef {
  return {
    title: 'Goodwill',
    caption: 'Reconciliation of the carrying amount of goodwill.',
    columns: YEAR,
    factMappings: [map('Goodwill', 'sfp.goodwill')],
    manualRows: [
      'Gross carrying amount at the beginning of the year',
      'Additional goodwill recognised',
      'Derecognised on disposal',
      'Impairment losses',
      'Gross carrying amount at the end of the year',
      'Accumulated impairment at the end of the year',
    ],
  };
}

function smeGrantsTable(): FrameworkTableDef {
  return {
    title: 'Government grants',
    caption: 'Government grants recognised during the period.',
    columns: YEAR,
    factMappings: [map('Government grant income', 'perf.government_grants')],
    manualRows: [
      'Grants related to income',
      'Grants related to assets',
      'Deferred grant income at the reporting date',
      'Unfulfilled conditions and other contingencies',
    ],
  };
}

function smeSbpTable(): FrameworkTableDef {
  return {
    title: 'Share-based payment arrangements',
    caption: 'Description and amounts of share-based payment arrangements.',
    columns: YEAR,
    factMappings: [map('Share-based payment expense', 'perf.share_based_payment')],
    manualRows: [
      'Equity-settled arrangements — expense for the year',
      'Cash-settled arrangements — expense for the year',
      'Liability arising from cash-settled arrangements',
    ],
  };
}

function smeImpairmentTable(): FrameworkTableDef {
  return {
    title: 'Impairment losses',
    caption: 'Impairment losses recognised and reversed by class of asset.',
    columns: YEAR,
    factMappings: [map('Impairment losses recognised', 'perf.impairment')],
    manualRows: [
      'Property, plant and equipment',
      'Intangible assets',
      'Goodwill',
      'Inventories (net realisable value)',
      'Financial assets',
      'Impairment losses reversed',
    ],
  };
}

function smeForexTable(): FrameworkTableDef {
  return {
    title: 'Foreign exchange differences',
    caption: 'Exchange differences recognised in profit or loss.',
    columns: YEAR,
    factMappings: [map('Net foreign exchange gain / (loss)', 'perf.forex')],
    manualRows: [
      'Exchange differences on foreign currency transactions',
      'Exchange differences on translation of foreign operations (if any)',
    ],
  };
}

function smeCommitmentsTable(): FrameworkTableDef {
  return {
    title: 'Commitments',
    caption: 'Capital and other commitments at the reporting date.',
    columns: YEAR,
    manualRows: [
      'Capital commitments — contracted',
      'Capital commitments — authorised but not contracted',
      'Other commitments',
    ],
  };
}

function smeContingenciesTable(): FrameworkTableDef {
  return {
    title: 'Contingencies',
    caption: 'Contingent liabilities and contingent assets.',
    columns: ['Nature', 'Estimate of financial effect', 'Uncertainties'],
    manualRows: ['Guarantees and sureties', 'Legal proceedings', 'Other contingent liabilities', 'Contingent assets'],
  };
}

function smeDiscontinuedTable(): FrameworkTableDef {
  return {
    title: 'Discontinued operations',
    caption: 'Results and cash flows of discontinued operations.',
    columns: YEAR,
    factMappings: [map('Profit / (loss) from discontinued operations', 'perf.discontinued')],
    manualRows: [
      'Revenue',
      'Expenses',
      'Tax',
      'Gain / (loss) on disposal',
      'Net cash from operating activities',
      'Net cash from investing activities',
      'Net cash from financing activities',
    ],
  };
}

function smeBiologicalTable(): FrameworkTableDef {
  return {
    title: 'Biological assets',
    caption: 'Reconciliation of biological assets measured at fair value less costs to sell.',
    columns: YEAR,
    factMappings: [map('Biological assets', 'sfp.biological')],
    manualRows: [
      'Fair value at the beginning of the year',
      'Increases due to purchases and births',
      'Decreases due to sales and harvest',
      'Fair value adjustments',
      'Fair value at the end of the year',
    ],
  };
}

function smeEquityTable(): FrameworkTableDef {
  return {
    title: 'Components of equity',
    caption: 'Analysis of equity by component.',
    columns: YEAR,
    factMappings: [
      map('Share capital', 'sfp.share_capital'),
      map('Retained earnings', 'sfp.retained_earnings'),
    ],
    manualRows: ['Other reserves', 'Non-controlling interests', 'Total equity'],
  };
}

function smePolicyChangeTable(): FrameworkTableDef {
  return {
    title: 'Effect of change in accounting policy / prior period error',
    caption: 'Restatement of comparative amounts.',
    columns: ['Description', 'As previously reported', 'Adjustment', 'As restated'],
    manualRows: [
      'Equity at the beginning of the prior period',
      'Profit or loss for the prior period',
      'Equity at the end of the prior period',
    ],
  };
}

// ── Policies ─────────────────────────────────────────────────────────────────

export function buildIfrsForSmePolicies(): FrameworkPolicyDef[] {
  return [
    pol({
      code: 'POL.BASIS',
      title: 'Basis of preparation',
      intro:
        'These annual financial statements have been prepared in accordance with the International Financial Reporting Standard for Small and Medium-sized Entities (IFRS for SMEs) issued by the International Accounting Standards Board. They are presented in the functional currency of the entity and have been prepared on the going concern and accrual bases under the historical cost convention, except where the IFRS for SMEs requires or permits another measurement basis.',
      presentation:
        'Assets and liabilities are presented as current or non-current. Comparative information is presented for the preceding period unless the IFRS for SMEs permits otherwise.',
      standards: [S(3), S(10)],
      sectionReferences: [S(3), S(10)],
      checklistRefs: ['SME-3.3', 'SME-8.5'],
    }),
    pol({
      code: 'POL.REVENUE',
      title: 'Revenue',
      recognition:
        'Revenue from the sale of goods is recognised when the significant risks and rewards of ownership have been transferred to the buyer, the entity retains neither continuing managerial involvement nor effective control, the amount of revenue can be measured reliably, it is probable that the economic benefits will flow to the entity, and the costs incurred or to be incurred can be measured reliably. Revenue from the rendering of services is recognised by reference to the stage of completion of the transaction at the reporting date when the outcome can be estimated reliably. Interest is recognised using the effective interest method; royalties on an accrual basis; and dividends when the shareholder’s right to receive payment is established.',
      initialMeasurement:
        'Revenue is measured at the fair value of the consideration received or receivable, net of value added tax, trade discounts and volume rebates.',
      judgements:
        'Judgement is applied in determining the stage of completion of service transactions and whether the risks and rewards of ownership have transferred.',
      standards: [S(23)],
      sectionReferences: [S(23)],
      checklistRefs: ['SME-23.30'],
    }),
    pol({
      code: 'POL.PPE',
      title: 'Property, plant and equipment',
      recognition:
        'An item of property, plant and equipment is recognised as an asset when it is probable that future economic benefits associated with the item will flow to the entity and the cost of the item can be measured reliably.',
      initialMeasurement:
        'Items are measured initially at cost, comprising the purchase price and any costs directly attributable to bringing the asset to the location and condition necessary for it to be capable of operating in the manner intended by management.',
      subsequentMeasurement:
        'After initial recognition, property, plant and equipment is measured at cost less accumulated depreciation and accumulated impairment losses. Depreciation is charged so as to allocate the cost of assets less residual values over their estimated useful lives, using the straight-line method unless another method better reflects the pattern of consumption of economic benefits.',
      derecognition:
        'An item is derecognised on disposal or when no future economic benefits are expected from its use or disposal. The gain or loss is included in profit or loss.',
      estimates:
        'Useful lives, residual values and depreciation methods are reviewed when events or changes in circumstances indicate that they may have changed, and any change is accounted for as a change in accounting estimate.',
      standards: [S(17)],
      sectionReferences: [S(17)],
      checklistRefs: ['SME-17.31'],
    }),
    pol({
      code: 'POL.INTANGIBLES',
      title: 'Intangible assets other than goodwill',
      recognition:
        'An intangible asset is recognised when it is identifiable, the entity controls it, it is probable that future economic benefits will flow to the entity, and its cost can be measured reliably. Internally generated brands, logos, publishing titles, customer lists and items similar in substance are not recognised as intangible assets. Research expenditure is recognised as an expense when incurred. Development expenditure is capitalised only when the recognition criteria in Section 18 are met.',
      initialMeasurement: 'Intangible assets are measured initially at cost.',
      subsequentMeasurement:
        'Intangible assets are subsequently carried at cost less accumulated amortisation and impairment losses and are amortised on a systematic basis over their useful lives. If the useful life cannot be established reliably, the life is presumed not to exceed ten years.',
      standards: [S(18)],
      sectionReferences: [S(18)],
      checklistRefs: ['SME-18.27'],
    }),
    pol({
      code: 'POL.INVPROP',
      title: 'Investment property',
      recognition:
        'Investment property is property (land or a building, or part of a building, or both) held by the owner or by the lessee under a finance lease to earn rentals or for capital appreciation, or both, rather than for use in the production or supply of goods or services or for administrative purposes, or for sale in the ordinary course of business.',
      initialMeasurement: 'Investment property is measured initially at cost.',
      subsequentMeasurement:
        'Investment property whose fair value can be measured reliably without undue cost or effort is measured at fair value at each reporting date, with changes in fair value recognised in profit or loss. All other investment property is accounted for as property, plant and equipment using the cost-depreciation-impairment model in Section 17.',
      standards: [S(16)],
      sectionReferences: [S(16)],
      checklistRefs: ['SME-16.24'],
    }),
    pol({
      code: 'POL.LEASES',
      title: 'Leases',
      recognition:
        'Leases are classified as finance leases or operating leases. A lease is classified as a finance lease if it transfers substantially all the risks and rewards incidental to ownership. All other leases are classified as operating leases.',
      initialMeasurement:
        'At the commencement of the lease term, a lessee recognises finance leases as assets and liabilities at amounts equal to the fair value of the leased property or, if lower, the present value of the minimum lease payments. Operating lease payments are recognised as an expense on a straight-line basis over the lease term unless another systematic basis is more representative of the time pattern of the user’s benefit.',
      subsequentMeasurement:
        'Finance lease assets are depreciated over the shorter of the lease term and the useful life of the asset, unless there is reasonable certainty that the lessee will obtain ownership. Minimum lease payments are apportioned between the finance charge and the reduction of the outstanding liability.',
      standards: [S(20)],
      sectionReferences: [S(20)],
      checklistRefs: ['SME-20.13'],
    }),
    pol({
      code: 'POL.FININST',
      title: 'Financial instruments',
      recognition:
        'The entity recognises a financial asset or a financial liability only when it becomes a party to the contractual provisions of the instrument. Basic financial instruments within the scope of Section 11 are accounted for under that section. Other financial instruments and transactions are accounted for under Section 12.',
      initialMeasurement:
        'Basic financial instruments are measured initially at the transaction price, including transaction costs, except where the arrangement constitutes a financing transaction, in which case they are measured at the present value of future payments discounted at a market rate of interest for a similar debt instrument.',
      subsequentMeasurement:
        'At the end of each reporting period, basic debt instruments are measured at amortised cost using the effective interest method, less impairment. Commitments to receive or make a loan that cannot be settled net in cash are measured at cost less impairment. Investments in non-convertible preference shares and non-puttable ordinary shares are measured at fair value if fair value can be measured reliably, otherwise at cost less impairment. Other financial instruments within Section 12 are measured at fair value through profit or loss, except for equity instruments without a quoted price whose fair value cannot be measured reliably, which are measured at cost less impairment.',
      derecognition:
        'A financial asset is derecognised when the contractual rights to the cash flows expire or are settled, or substantially all risks and rewards of ownership are transferred. A financial liability is derecognised only when it is extinguished.',
      standards: [S(11), S(12)],
      sectionReferences: [S(11), S(12)],
      checklistRefs: ['SME-11.40', 'SME-11.41'],
    }),
    pol({
      code: 'POL.IMPAIRMENT',
      title: 'Impairment of assets',
      recognition:
        'At each reporting date the entity assesses whether there is any indication that an asset may be impaired. If any such indication exists, the recoverable amount of the asset is estimated. Goodwill and intangible assets with an indefinite useful life, or not yet available for use, are tested for impairment when there is an indication of impairment.',
      subsequentMeasurement:
        'An impairment loss is recognised immediately in profit or loss when the carrying amount of an asset exceeds its recoverable amount. The recoverable amount is the higher of fair value less costs to sell and value in use. Impairment losses on goodwill are not reversed. For other assets, an impairment loss is reversed if the reasons for the impairment have ceased to apply, limited to what the carrying amount would have been had no impairment been recognised.',
      standards: [S(27)],
      sectionReferences: [S(27)],
      checklistRefs: ['SME-27.32'],
    }),
    pol({
      code: 'POL.INVENTORY',
      title: 'Inventories',
      initialMeasurement:
        'Inventories are measured initially at cost, comprising all costs of purchase, costs of conversion and other costs incurred in bringing the inventories to their present location and condition.',
      subsequentMeasurement:
        'Inventories are subsequently measured at the lower of cost and estimated selling price less costs to complete and sell. Cost is assigned using the first-in, first-out or weighted-average cost formula. The same cost formula is used for all inventories having a similar nature and use.',
      standards: [S(13)],
      sectionReferences: [S(13)],
      checklistRefs: ['SME-13.22'],
    }),
    pol({
      code: 'POL.PROVISIONS',
      title: 'Provisions and contingencies',
      recognition:
        'A provision is recognised when the entity has an obligation at the reporting date as a result of a past event, it is probable that the entity will be required to transfer economic benefits in settlement, and the amount of the obligation can be estimated reliably. Contingent liabilities are not recognised as liabilities. Contingent assets are not recognised as assets.',
      initialMeasurement:
        'Provisions are measured at the best estimate of the amount required to settle the obligation at the reporting date, discounted where the effect of the time value of money is material.',
      standards: [S(21)],
      sectionReferences: [S(21)],
      checklistRefs: ['SME-21.14'],
    }),
    pol({
      code: 'POL.EMPLOYEE',
      title: 'Employee benefits',
      recognition:
        'The cost of short-term employee benefits is recognised as an expense in the period in which the employee renders the related service, unless another section requires or permits inclusion in the cost of an asset. A liability is recognised for the amount expected to be paid under short-term cash bonus or profit-sharing plans and for accumulating compensated absences when the employees render service that increases their entitlement.',
      subsequentMeasurement:
        'Contributions to defined contribution plans are recognised as an expense as the employee renders service. For defined benefit plans, the entity uses the projected unit credit method to measure its defined benefit obligation and the related expense, unless undue cost or effort would be involved, in which case the entity is permitted to simplify measurement in accordance with Section 28. Other long-term employee benefits and termination benefits are recognised and measured in accordance with Section 28.',
      standards: [S(28)],
      sectionReferences: [S(28)],
      checklistRefs: ['SME-28.41'],
    }),
    pol({
      code: 'POL.TAX',
      title: 'Income tax',
      recognition:
        'Current tax is the amount of income tax payable or recoverable in respect of the taxable profit or tax loss for the current or prior periods, measured using tax rates and laws that have been enacted or substantively enacted by the reporting date.',
      subsequentMeasurement:
        'Deferred tax is recognised in respect of temporary differences between the carrying amounts of assets and liabilities and their tax bases, and unused tax losses and tax credits, using the tax rates expected to apply when the temporary difference reverses. A deferred tax asset is recognised only to the extent that it is probable that taxable profit will be available against which the deductible temporary difference, unused tax losses or unused tax credits can be utilised. Deferred tax is not discounted.',
      standards: [S(29)],
      sectionReferences: [S(29)],
      checklistRefs: ['SME-29.31'],
    }),
    pol({
      code: 'POL.FOREX',
      title: 'Foreign currency translation',
      recognition:
        'A foreign currency transaction is recorded, on initial recognition in the functional currency, by applying the spot exchange rate at the date of the transaction.',
      subsequentMeasurement:
        'At the end of each reporting period, foreign currency monetary items are translated using the closing rate. Non-monetary items measured at historical cost in a foreign currency are not retranslated. Exchange differences are recognised in profit or loss in the period in which they arise, except as otherwise required by the IFRS for SMEs.',
      standards: [S(30)],
      sectionReferences: [S(30)],
      checklistRefs: ['SME-30.25'],
    }),
    pol({
      code: 'POL.BORROWINGCOST',
      title: 'Borrowing costs',
      recognition:
        'All borrowing costs are recognised as an expense in profit or loss in the period in which they are incurred.',
      standards: [S(25)],
      sectionReferences: [S(25)],
      checklistRefs: ['SME-25.2'],
    }),
    pol({
      code: 'POL.GRANTS',
      title: 'Government grants',
      recognition:
        'A government grant is recognised when there is reasonable assurance that the entity will comply with the conditions attaching to it and that the grant will be received. Grants are recognised in income on a systematic basis over the periods in which the entity recognises the related costs for which the grant is intended to compensate. A grant that becomes receivable as compensation for expenses or losses already incurred, or for the purpose of giving immediate financial support with no future related costs, is recognised in income in the period in which it becomes receivable.',
      subsequentMeasurement:
        'Government grants related to assets are recognised either as deferred income or by deducting the grant in arriving at the carrying amount of the asset, consistently with the chosen presentation policy.',
      standards: [S(24)],
      sectionReferences: [S(24)],
      checklistRefs: ['SME-24.6'],
    }),
    pol({
      code: 'POL.ASSOCIATES',
      title: 'Investments in associates',
      recognition:
        'An associate is an entity, including an unincorporated entity such as a partnership, over which the investor has significant influence and that is neither a subsidiary nor an interest in a joint venture. Significant influence is the power to participate in the financial and operating policy decisions of the associate but is not control or joint control.',
      subsequentMeasurement:
        'In the investor’s consolidated financial statements, investments in associates are accounted for using the equity method, unless the investment is measured at fair value through profit or loss or the investor is exempt from preparing consolidated financial statements. In an investor’s separate financial statements, investments in associates are accounted for at cost less impairment, at fair value through profit or loss, or using the equity method.',
      standards: [S(14)],
      sectionReferences: [S(14)],
      checklistRefs: ['SME-14.12'],
    }),
    pol({
      code: 'POL.JOINTVENTURES',
      title: 'Investments in joint ventures',
      recognition:
        'A joint venture is a contractual arrangement whereby two or more parties undertake an economic activity that is subject to joint control. Joint control is the contractually agreed sharing of control over an economic activity and exists only when the strategic financial and operating decisions require the unanimous consent of the parties sharing control.',
      subsequentMeasurement:
        'Jointly controlled entities are accounted for using the equity method in consolidated financial statements, unless measured at fair value through profit or loss. Interests in jointly controlled operations and jointly controlled assets are recognised by including the entity’s share of assets, liabilities, income and expenses.',
      standards: [S(15)],
      sectionReferences: [S(15)],
      checklistRefs: ['SME-15.21'],
    }),
    pol({
      code: 'POL.BUSCOMB',
      title: 'Business combinations and goodwill',
      recognition:
        'All business combinations are accounted for by applying the purchase method. Goodwill acquired in a business combination is recognised as an asset from the acquisition date and represents the future economic benefits arising from assets that are not capable of being individually identified and separately recognised.',
      subsequentMeasurement:
        'After initial recognition, the acquirer measures goodwill acquired in a business combination at cost less accumulated amortisation and accumulated impairment losses. Goodwill is considered to have a finite useful life and is amortised on a systematic basis over its useful life. If a reliable estimate of the useful life cannot be made, the life is presumed not to exceed ten years. Goodwill is tested for impairment in accordance with Section 27 when there is an indication of impairment.',
      standards: [S(19)],
      sectionReferences: [S(19)],
      checklistRefs: ['SME-19.25'],
    }),
    pol({
      code: 'POL.SBP',
      title: 'Share-based payment',
      recognition:
        'Equity-settled share-based payment transactions with employees are measured at the fair value of the equity instruments granted at grant date. The fair value is recognised as an expense with a corresponding increase in equity over the vesting period. Cash-settled share-based payment transactions are measured at the fair value of the liability, remeasured at each reporting date and at the date of settlement, with changes recognised in profit or loss.',
      standards: [S(26)],
      sectionReferences: [S(26)],
      checklistRefs: ['SME-26.18'],
    }),
    pol({
      code: 'POL.HYPERINFLATION',
      title: 'Hyperinflation',
      recognition:
        'If the functional currency is the currency of a hyperinflationary economy, the financial statements are stated in terms of the measuring unit current at the end of the reporting period in accordance with Section 31. Comparative amounts are also restated. The gain or loss on the net monetary position is included in profit or loss.',
      standards: [S(31)],
      sectionReferences: [S(31)],
      checklistRefs: ['SME-31.1'],
    }),
    pol({
      code: 'POL.CONSOLIDATION',
      title: 'Consolidated and separate financial statements',
      recognition:
        'A parent presents consolidated financial statements in which it consolidates its investments in subsidiaries, unless it is exempt under Section 9. Control is the power to govern the financial and operating policies of an entity so as to obtain benefits from its activities.',
      presentation:
        'Intragroup balances and transactions are eliminated in full. In separate financial statements, investments in subsidiaries, associates and jointly controlled entities are accounted for at cost less impairment, at fair value through profit or loss, or using the equity method.',
      standards: [S(9)],
      sectionReferences: [S(9)],
      checklistRefs: ['SME-9.23'],
    }),
    pol({
      code: 'POL.EQUITY',
      title: 'Liabilities and equity',
      recognition:
        'Equity is the residual interest in the assets of the entity after deducting all its liabilities. An instrument is classified as a liability or as equity in accordance with the substance of the contractual arrangement. Members’ shares in co-operative entities and similar instruments are classified in accordance with Section 22.',
      presentation:
        'Treasury shares are presented as a deduction from equity. No gain or loss is recognised in profit or loss on the purchase, sale, issue or cancellation of an entity’s own equity instruments.',
      standards: [S(22)],
      sectionReferences: [S(22)],
      checklistRefs: ['SME-22.7'],
    }),
  ];
}

// ── Disclosures ──────────────────────────────────────────────────────────────

export function buildIfrsForSmeNotes(): FrameworkNoteDef[] {
  return [
    {
      code: 'DISC.GENERAL',
      title: 'General information',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Identifies the reporting entity and the financial statements.',
      narrative:
        'These annual financial statements are the financial statements of the entity for the reporting period presented. The entity is incorporated and domiciled in its country of registration, and its principal activities are those disclosed in the directors’ report or equivalent. The financial statements were authorised for issue by those charged with governance on the date stated on the approval page.',
      standards: [S(3)],
      sectionReferences: [S(3)],
      crossReferences: ['DISC.BASIS'],
      checklistRefs: ['SME-3.3', 'SME-3.23'],
      validationRules: ['FW.REQUIRED_DISCLOSURES', 'FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 10, headingStyle: 'note' },
      category: 'general',
    },
    {
      code: 'DISC.BASIS',
      title: 'Basis of preparation',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'States compliance with the IFRS for SMEs and the measurement bases applied.',
      narratives: [
        'The annual financial statements have been prepared in accordance with the IFRS for SMEs and in the manner required by the applicable companies legislation in the jurisdiction of incorporation. They are presented in the functional and presentation currency of the entity.',
        'The financial statements have been prepared on the historical cost basis, except for financial instruments and other items measured at fair value where required or elected under the IFRS for SMEs, and on the going concern and accrual bases of accounting.',
      ],
      standards: [S(3), S(8)],
      sectionReferences: [S(3), S(8)],
      crossReferences: ['DISC.POLICIES', 'DISC.JUDGEMENTS'],
      dependencies: ['POL.BASIS'],
      policyReferences: ['POL.BASIS'],
      checklistRefs: ['SME-3.3', 'SME-8.5'],
      validationRules: ['FW.REQUIRED_DISCLOSURES', 'FW.IFRS_SME.SIMPLIFIED', 'FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 20, headingStyle: 'note' },
      category: 'presentation',
    },
    {
      code: 'DISC.POLICIES',
      title: 'Significant accounting policies',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Summarises the significant accounting policies applied.',
      narrative:
        'The principal accounting policies applied in the preparation of these annual financial statements are set out below and in the accounting policies note. These policies have been applied consistently to all periods presented, unless otherwise stated.',
      standards: [S(8), S(10)],
      sectionReferences: [S(8), S(10)],
      crossReferences: ['DISC.JUDGEMENTS'],
      checklistRefs: ['SME-8.5'],
      validationRules: ['FW.ACCOUNTING_POLICIES', 'FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 30, headingStyle: 'policy' },
      category: 'accounting_policy',
    },
    {
      code: 'DISC.JUDGEMENTS',
      title: 'Significant judgements and sources of estimation uncertainty',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses judgements and estimation uncertainty with a significant risk of material adjustment.',
      narrative:
        'In applying the entity’s accounting policies, management makes judgements, estimates and assumptions about the carrying amounts of assets and liabilities that are not readily apparent from other sources. The estimates and associated assumptions are based on historical experience and other factors considered relevant. Actual results may differ from these estimates. Estimates and underlying assumptions are reviewed on an ongoing basis. Revisions to accounting estimates are recognised in the period of the revision and future periods affected. The areas involving a higher degree of judgement or complexity, or areas where assumptions and estimates are significant to the financial statements, include the useful lives and residual values of property, plant and equipment and intangible assets, impairment assessments, the measurement of provisions, the recoverability of deferred tax assets, and the impairment of financial assets measured at amortised cost.',
      standards: [S(8)],
      sectionReferences: [S(8)],
      dependencies: ['DISC.POLICIES'],
      crossReferences: ['DISC.POLICIES'],
      checklistRefs: ['SME-8.6', 'SME-8.7'],
      validationRules: ['FW.REQUIRED_DISCLOSURES', 'FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 40, headingStyle: 'note' },
      category: 'accounting_policy',
    },
    {
      code: 'DISC.POLICYCHANGES',
      title: 'Changes in accounting policies, estimates and errors',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasPolicyChangeOrError',
      purpose: 'Discloses voluntary policy changes, changes in estimates and prior period errors.',
      narratives: [
        'A change in accounting policy is applied retrospectively unless impracticable, with comparative information restated. A change in accounting estimate is recognised prospectively. Prior period errors are corrected retrospectively by restating comparative amounts, unless impracticable.',
        'Where a change in accounting policy, a change in estimate with material effect, or a prior period error has occurred in the current period, the nature and amount of the adjustment are set out below.',
      ],
      table: smePolicyChangeTable(),
      standards: [S(10)],
      sectionReferences: [S(10)],
      dependencies: ['POL.BASIS'],
      policyReferences: ['POL.BASIS'],
      checklistRefs: ['SME-10.13', 'SME-10.17', 'SME-10.21'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 45, headingStyle: 'note' },
      category: 'accounting_policy',
    },
    {
      code: 'DISC.REVENUE',
      title: 'Revenue',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses the amount of revenue recognised by category.',
      narrative:
        'Revenue comprises the fair value of the consideration received or receivable for the sale of goods and services in the ordinary course of the entity’s activities, net of value added tax, rebates and discounts. The analysis of revenue for the period is set out below.',
      table: smeRevenueTable(),
      standards: [S(23)],
      sectionReferences: [S(23)],
      dependencies: ['POL.REVENUE'],
      policyReferences: ['POL.REVENUE'],
      crossReferences: ['DISC.POLICIES'],
      checklistRefs: ['SME-23.30'],
      validationRules: ['FW.REQUIRED_DISCLOSURES', 'FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 100, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.PPE',
      title: 'Property, plant and equipment',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Reconciles property, plant and equipment and discloses measurement bases and useful lives.',
      narratives: [
        'Property, plant and equipment is carried at cost less accumulated depreciation and accumulated impairment losses. Depreciation is recognised so as to write off the cost of assets less residual values over their useful lives on a straight-line basis.',
        'The reconciliation of the carrying amount at the beginning and end of the period, and the depreciation charge for the year, are set out below. Useful lives applied during the period are consistent with those disclosed in the accounting policies, unless a change in estimate has been made.',
      ],
      table: smePpeTable(),
      standards: [S(17)],
      sectionReferences: [S(17)],
      dependencies: ['POL.PPE'],
      policyReferences: ['POL.PPE'],
      crossReferences: ['DISC.POLICIES', 'DISC.IMPAIRMENT'],
      checklistRefs: ['SME-17.31'],
      validationRules: ['FW.REQUIRED_DISCLOSURES', 'FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 200, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.INTANGIBLES',
      title: 'Intangible assets other than goodwill',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasIntangibleAssets',
      purpose: 'Reconciles intangible assets other than goodwill.',
      narrative:
        'Intangible assets other than goodwill are carried at cost less accumulated amortisation and impairment losses. The reconciliation of the carrying amount is set out below.',
      table: smeIntangiblesTable(),
      standards: [S(18)],
      sectionReferences: [S(18)],
      dependencies: ['POL.INTANGIBLES'],
      policyReferences: ['POL.INTANGIBLES'],
      crossReferences: ['DISC.IMPAIRMENT'],
      checklistRefs: ['SME-18.27'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 210, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.INVPROP',
      title: 'Investment property',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasInvestmentProperty',
      purpose: 'Discloses investment property measured at fair value or cost.',
      narrative:
        'Investment property is measured at fair value where fair value can be measured reliably without undue cost or effort, with changes recognised in profit or loss; otherwise it is accounted for under the cost model in Section 17. The reconciliation of the carrying amount is set out below.',
      table: smeInvPropTable(),
      standards: [S(16)],
      sectionReferences: [S(16)],
      dependencies: ['POL.INVPROP'],
      policyReferences: ['POL.INVPROP'],
      checklistRefs: ['SME-16.24'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 220, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.INVENTORIES',
      title: 'Inventories',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasInventories',
      purpose: 'Discloses the carrying amount of inventories and write-downs.',
      narrative:
        'Inventories are stated at the lower of cost and estimated selling price less costs to complete and sell. The carrying amounts by category and any write-down recognised as an expense are set out below.',
      table: smeInventoriesTable(),
      standards: [S(13)],
      sectionReferences: [S(13)],
      dependencies: ['POL.INVENTORY'],
      policyReferences: ['POL.INVENTORY'],
      checklistRefs: ['SME-13.22'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 300, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.RECEIVABLES',
      title: 'Trade and other receivables',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasReceivables',
      purpose: 'Discloses trade and other receivables and impairment.',
      narrative:
        'Trade and other receivables are basic financial assets measured at amortised cost less any impairment. The analysis of receivables is set out below.',
      table: smeReceivablesTable(),
      standards: [S(11)],
      sectionReferences: [S(11)],
      dependencies: ['POL.FININST'],
      policyReferences: ['POL.FININST'],
      crossReferences: ['DISC.FININST'],
      checklistRefs: ['SME-11.41'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 310, headingStyle: 'note' },
      category: 'financial_instrument',
    },
    {
      code: 'DISC.PAYABLES',
      title: 'Trade and other payables',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasPayables',
      purpose: 'Analyses trade and other payables.',
      narrative:
        'Trade and other payables are basic financial liabilities measured at amortised cost. The analysis by class is set out below.',
      table: smePayablesTable(),
      standards: [S(11)],
      sectionReferences: [S(11)],
      dependencies: ['POL.FININST'],
      policyReferences: ['POL.FININST'],
      crossReferences: ['DISC.FININST'],
      checklistRefs: ['SME-11.41'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 320, headingStyle: 'note' },
      category: 'financial_instrument',
    },
    {
      code: 'DISC.FININST',
      title: 'Financial instruments',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasFinancialInstruments',
      purpose: 'Discloses categories and carrying amounts of financial instruments.',
      narratives: [
        'Financial instruments are classified as basic financial instruments within Section 11 or as other financial instruments within Section 12. Basic debt instruments are measured at amortised cost using the effective interest method, less impairment. Other financial instruments are measured at fair value through profit or loss, except where Section 12 requires or permits cost less impairment.',
        'The carrying amounts of financial assets and financial liabilities by category are set out below.',
      ],
      table: smeFinInstTable(),
      standards: [S(11), S(12)],
      sectionReferences: [S(11), S(12)],
      dependencies: ['POL.FININST'],
      policyReferences: ['POL.FININST'],
      crossReferences: ['DISC.RECEIVABLES', 'DISC.PAYABLES', 'DISC.BORROWINGS'],
      checklistRefs: ['SME-11.40', 'SME-11.41', 'SME-12.26'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 330, headingStyle: 'note' },
      category: 'financial_instrument',
    },
    {
      code: 'DISC.LEASES',
      title: 'Leases',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasLeases',
      purpose: 'Discloses finance and operating lease commitments of the lessee.',
      narrative:
        'The entity is the lessee under finance and/or operating leases. For finance leases, the carrying amount of assets held under finance leases is included in property, plant and equipment, and the corresponding liability is included in borrowings or lease liabilities. Future minimum lease payments under non-cancellable leases are set out below.',
      table: smeLeaseTable(),
      standards: [S(20)],
      sectionReferences: [S(20)],
      dependencies: ['POL.LEASES'],
      policyReferences: ['POL.LEASES'],
      crossReferences: ['DISC.PPE', 'DISC.BORROWINGS'],
      checklistRefs: ['SME-20.13', 'SME-20.16'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 340, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.BORROWINGS',
      title: 'Borrowings',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasBorrowings',
      purpose: 'Analyses borrowings and defaults or breaches where applicable.',
      narrative:
        'Borrowings are basic financial liabilities measured at amortised cost using the effective interest method. The analysis of borrowings, including the current and non-current portions, is set out below. Where there has been a breach of loan covenants that has not been remedied at the reporting date, the particulars of the breach are disclosed.',
      table: smeBorrowingsTable(),
      standards: [S(11)],
      sectionReferences: [S(11)],
      dependencies: ['POL.FININST'],
      policyReferences: ['POL.FININST'],
      crossReferences: ['DISC.FININST'],
      checklistRefs: ['SME-11.42'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 350, headingStyle: 'note' },
      category: 'financial_instrument',
    },
    {
      code: 'DISC.PROVISIONS',
      title: 'Provisions',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasProvisions',
      purpose: 'Reconciles provisions and describes uncertainties.',
      narrative:
        'Provisions are recognised where the entity has a present obligation as a result of a past event, an outflow of resources is probable and a reliable estimate can be made. Movements in provisions and a description of the nature of the obligation, expected timing of outflows and uncertainties are set out below.',
      table: smeProvisionsTable(),
      standards: [S(21)],
      sectionReferences: [S(21)],
      dependencies: ['POL.PROVISIONS'],
      policyReferences: ['POL.PROVISIONS'],
      crossReferences: ['DISC.CONTINGENT'],
      checklistRefs: ['SME-21.14'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 400, headingStyle: 'note' },
      category: 'contingency',
    },
    {
      code: 'DISC.CONTINGENT',
      title: 'Contingencies',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasContingencies',
      purpose: 'Discloses contingent liabilities and contingent assets.',
      narrative:
        'Unless the possibility of any outflow in settlement is remote, contingent liabilities are disclosed with an estimate of the financial effect, an indication of uncertainties and the possibility of reimbursement. Contingent assets are disclosed where an inflow of economic benefits is probable. Particulars are set out below.',
      table: smeContingenciesTable(),
      standards: [S(21)],
      sectionReferences: [S(21)],
      dependencies: ['POL.PROVISIONS'],
      policyReferences: ['POL.PROVISIONS'],
      crossReferences: ['DISC.PROVISIONS'],
      checklistRefs: ['SME-21.15', 'SME-21.16'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 860, headingStyle: 'note' },
      category: 'contingency',
    },
    {
      code: 'DISC.COMMITMENTS',
      title: 'Commitments',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasCommitments',
      purpose: 'Discloses capital and other commitments.',
      narrative:
        'Capital and other commitments contracted for at the reporting date but not yet recognised in the statement of financial position are set out below.',
      table: smeCommitmentsTable(),
      standards: [S(17)],
      sectionReferences: [S(17)],
      crossReferences: ['DISC.PPE'],
      checklistRefs: ['SME-17.32'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 850, headingStyle: 'note' },
      category: 'contingency',
    },
    {
      code: 'DISC.EMPLOYEE',
      title: 'Employee benefits',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasEmployeeBenefits',
      purpose: 'Discloses employee benefit obligations and defined contribution costs.',
      narrative:
        'Employee benefits comprise short-term benefits, post-employment benefits, other long-term benefits and termination benefits. The total cost of defined contribution plans for the period is disclosed below, together with the analysis of employee benefit liabilities.',
      table: smeEmployeeTable(),
      standards: [S(28)],
      sectionReferences: [S(28)],
      dependencies: ['POL.EMPLOYEE'],
      policyReferences: ['POL.EMPLOYEE'],
      checklistRefs: ['SME-28.40', 'SME-28.41'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 410, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.TAX',
      title: 'Income tax',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses the major components of tax expense and a reconciliation to accounting profit.',
      narrative:
        'The income tax expense comprises current and deferred tax. A reconciliation between the tax expense and the product of accounting profit multiplied by the applicable tax rate is set out below, together with an explanation of changes in the applicable rate where relevant.',
      table: smeTaxTable(),
      standards: [S(29)],
      sectionReferences: [S(29)],
      dependencies: ['POL.TAX'],
      policyReferences: ['POL.TAX'],
      checklistRefs: ['SME-29.31', 'SME-29.32'],
      validationRules: ['FW.REQUIRED_DISCLOSURES', 'FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 500, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.SHARECAPITAL',
      title: 'Share capital and equity',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasShareCapital',
      purpose: 'Discloses share capital and movements in equity instruments.',
      narrative:
        'The authorised and issued share capital of the entity, including any shares issued or redeemed during the period and rights, preferences and restrictions, are set out below. For entities without share capital, information equivalent to that required for share capital is presented for each category of equity.',
      tables: [smeShareCapitalTable(), smeEquityTable()],
      standards: [S(4), S(6), S(22)],
      sectionReferences: [S(4), S(6), S(22)],
      dependencies: ['POL.EQUITY'],
      policyReferences: ['POL.EQUITY'],
      checklistRefs: ['SME-4.12', 'SME-6.3', 'SME-22.7'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 600, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.CASHFLOW',
      title: 'Notes to the statement of cash flows',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasCashFlowReconciliation',
      purpose: 'Reconciles profit to cash from operations and discloses cash components.',
      narrative:
        'Cash and cash equivalents comprise cash on hand and demand deposits, and other short-term highly liquid investments readily convertible to known amounts of cash. The reconciliation of profit or loss to cash generated from operations, and the major classes of cash flows, are set out below.',
      table: smeCashFlowTable(),
      standards: [S(7)],
      sectionReferences: [S(7)],
      checklistRefs: ['SME-7.20', 'SME-7.21'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 700, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.RELATED',
      title: 'Related party disclosures',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses related party relationships, transactions, balances and key management compensation.',
      narratives: [
        'Related party relationships exist between the entity and its parent, subsidiaries, associates, joint ventures, key management personnel and close members of their families, and entities controlled, jointly controlled or significantly influenced by them. Transactions with related parties are entered into in the ordinary course of business.',
        'The nature of related party relationships, information about transactions and outstanding balances, and key management personnel compensation, are set out below.',
      ],
      tables: [smeRelatedTable(), smeKmpTable()],
      standards: [S(33)],
      sectionReferences: [S(33)],
      crossReferences: ['DISC.POLICIES'],
      dependencies: ['POL.BASIS'],
      checklistRefs: ['SME-33.5', 'SME-33.9'],
      validationRules: ['FW.REQUIRED_DISCLOSURES', 'FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 800, headingStyle: 'note' },
      category: 'related_party',
    },
    {
      code: 'DISC.EVENTS',
      title: 'Events after the end of the reporting period',
      requirement: 'mandatory',
      disclosureClass: 'required',
      purpose: 'Discloses adjusting and non-adjusting events after the reporting period.',
      narrative:
        'Events after the end of the reporting period are those events, favourable and unfavourable, that occur between the end of the reporting period and the date when the financial statements are authorised for issue. Adjusting events are reflected in the amounts recognised. Material non-adjusting events are disclosed, including the nature of the event and an estimate of its financial effect, or a statement that such an estimate cannot be made. Those charged with governance are not aware of any material non-adjusting events requiring disclosure, other than as set out in this note if applicable.',
      standards: [S(32)],
      sectionReferences: [S(32)],
      crossReferences: ['DISC.BASIS'],
      dependencies: ['POL.BASIS'],
      checklistRefs: ['SME-32.4', 'SME-32.10'],
      validationRules: ['FW.REQUIRED_DISCLOSURES', 'FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 900, headingStyle: 'note' },
      category: 'subsequent_event',
    },
    {
      code: 'DISC.GOINGCONCERN',
      title: 'Going concern',
      requirement: 'optional',
      disclosureClass: 'optional',
      conditionKey: 'goingConcernUncertainty',
      purpose: 'Discloses material uncertainties related to going concern.',
      narrative:
        'The financial statements have been prepared on the going concern basis. Where management is aware of material uncertainties related to events or conditions that may cast significant doubt upon the entity’s ability to continue as a going concern, those uncertainties are disclosed, together with the basis on which the entity continues to adopt the going concern basis.',
      standards: [S(3)],
      sectionReferences: [S(3)],
      crossReferences: ['DISC.BASIS'],
      checklistRefs: ['SME-3.8'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 950, headingStyle: 'note' },
      category: 'presentation',
    },
    {
      code: 'DISC.ASSOCIATES',
      title: 'Investments in associates',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasAssociates',
      purpose: 'Discloses investments in associates.',
      narrative:
        'Associates are entities over which the entity has significant influence. The carrying amount of investments in associates and related summarised financial information are set out below.',
      table: smeAssociatesTable(),
      standards: [S(14)],
      sectionReferences: [S(14)],
      dependencies: ['POL.ASSOCIATES'],
      policyReferences: ['POL.ASSOCIATES'],
      checklistRefs: ['SME-14.12'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 250, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.JOINTVENTURES',
      title: 'Investments in joint ventures',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasJointVentures',
      purpose: 'Discloses interests in joint ventures.',
      narrative:
        'Joint ventures are contractual arrangements subject to joint control. The carrying amount of interests in jointly controlled entities and related information are set out below.',
      table: smeJointVenturesTable(),
      standards: [S(15)],
      sectionReferences: [S(15)],
      dependencies: ['POL.JOINTVENTURES'],
      policyReferences: ['POL.JOINTVENTURES'],
      checklistRefs: ['SME-15.21'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 255, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.BUSCOMB',
      title: 'Business combinations and goodwill',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasBusinessCombination',
      purpose: 'Discloses business combinations effected during the period and goodwill.',
      narratives: [
        'Business combinations are accounted for using the purchase method. For each material business combination effected during the period, the names and descriptions of the combining entities, the acquisition date, the percentage of voting equity acquired, the cost of combination and the amounts recognised for classes of assets, liabilities and contingent liabilities are disclosed.',
        'The reconciliation of goodwill is set out below.',
      ],
      table: smeGoodwillTable(),
      standards: [S(19)],
      sectionReferences: [S(19)],
      dependencies: ['POL.BUSCOMB'],
      policyReferences: ['POL.BUSCOMB'],
      crossReferences: ['DISC.IMPAIRMENT'],
      checklistRefs: ['SME-19.25', 'SME-19.26'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 230, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.GRANTS',
      title: 'Government grants',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasGovernmentGrants',
      purpose: 'Discloses the nature and extent of government grants.',
      narrative:
        'Government grants are recognised when there is reasonable assurance that the entity will comply with the conditions attaching to them and that the grants will be received. The nature and extent of grants recognised in the financial statements, and unfulfilled conditions and other contingencies, are set out below.',
      table: smeGrantsTable(),
      standards: [S(24)],
      sectionReferences: [S(24)],
      dependencies: ['POL.GRANTS'],
      policyReferences: ['POL.GRANTS'],
      checklistRefs: ['SME-24.6'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 120, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.BORROWINGCOST',
      title: 'Borrowing costs',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasBorrowingCosts',
      purpose: 'Discloses the accounting policy for borrowing costs (expense model).',
      narrative:
        'All borrowing costs are recognised as an expense in profit or loss in the period in which they are incurred. The amount of borrowing costs recognised as an expense during the period is disclosed with finance costs in profit or loss.',
      standards: [S(25)],
      sectionReferences: [S(25)],
      dependencies: ['POL.BORROWINGCOST'],
      policyReferences: ['POL.BORROWINGCOST'],
      crossReferences: ['DISC.BORROWINGS'],
      checklistRefs: ['SME-25.2'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 355, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.SBP',
      title: 'Share-based payment',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasShareBasedPayment',
      purpose: 'Discloses share-based payment arrangements.',
      narrative:
        'The nature and extent of share-based payment arrangements that existed during the period, including general terms and conditions, and the amounts recognised in the financial statements, are set out below.',
      table: smeSbpTable(),
      standards: [S(26)],
      sectionReferences: [S(26)],
      dependencies: ['POL.SBP'],
      policyReferences: ['POL.SBP'],
      checklistRefs: ['SME-26.18', 'SME-26.23'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 420, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.IMPAIRMENT',
      title: 'Impairment of assets',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasImpairment',
      purpose: 'Discloses impairment losses and reversals by class of asset.',
      narrative:
        'Impairment losses recognised or reversed during the period for each class of asset, and the events and circumstances that led to the recognition or reversal, are set out below.',
      table: smeImpairmentTable(),
      standards: [S(27)],
      sectionReferences: [S(27)],
      dependencies: ['POL.IMPAIRMENT'],
      policyReferences: ['POL.IMPAIRMENT'],
      crossReferences: ['DISC.PPE', 'DISC.INTANGIBLES', 'DISC.BUSCOMB'],
      checklistRefs: ['SME-27.32'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 270, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.FOREX',
      title: 'Foreign currency translation',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasForeignCurrency',
      purpose: 'Discloses the functional currency and exchange differences.',
      narratives: [
        'The functional currency of the entity is the currency of the primary economic environment in which it operates. Where the presentation currency differs from the functional currency, that fact and the reason are disclosed.',
        'Exchange differences recognised in profit or loss during the period are set out below.',
      ],
      table: smeForexTable(),
      standards: [S(30)],
      sectionReferences: [S(30)],
      dependencies: ['POL.FOREX'],
      policyReferences: ['POL.FOREX'],
      checklistRefs: ['SME-30.25', 'SME-30.26'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 520, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.HYPERINFLATION',
      title: 'Hyperinflationary reporting',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasHyperinflation',
      purpose: 'Discloses the fact of restatement under Section 31.',
      narrative:
        'The functional currency is that of a hyperinflationary economy. The financial statements and corresponding figures for previous periods have been restated for changes in the general purchasing power of the functional currency. The identity and level of the price index at the reporting date, and movements during the period, are disclosed together with the gain or loss on the net monetary position.',
      standards: [S(31)],
      sectionReferences: [S(31)],
      dependencies: ['POL.HYPERINFLATION'],
      policyReferences: ['POL.HYPERINFLATION'],
      checklistRefs: ['SME-31.1'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 530, headingStyle: 'note' },
      category: 'presentation',
    },
    {
      code: 'DISC.DISCONTINUED',
      title: 'Discontinued operations and assets held for sale',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasDiscontinuedOperations',
      purpose: 'Discloses discontinued operations.',
      narrative:
        'A discontinued operation is a component of the entity that has been disposed of or is held for sale and represents a separate major line of business or geographical area, or is a subsidiary acquired exclusively for resale. The results and cash flows of discontinued operations are set out below.',
      table: smeDiscontinuedTable(),
      standards: [S(5), S(4)],
      sectionReferences: ['IFRS for SMEs Section 5', 'IFRS for SMEs Section 4'],
      checklistRefs: ['SME-5.5'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 150, headingStyle: 'note' },
      category: 'statement_note',
    },
    {
      code: 'DISC.CONSOLIDATION',
      title: 'Consolidated and separate financial statements',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasSubsidiariesOrSeparateFs',
      purpose: 'Discloses the basis of consolidation or separate financial statements.',
      narrative:
        'Where consolidated financial statements are presented, subsidiaries are consolidated from the date control is obtained until the date control ceases. Where separate financial statements are presented, the accounting policy for investments in subsidiaries, associates and jointly controlled entities is disclosed, together with the reason for preparing separate financial statements where applicable.',
      standards: [S(9)],
      sectionReferences: [S(9)],
      dependencies: ['POL.CONSOLIDATION'],
      policyReferences: ['POL.CONSOLIDATION'],
      checklistRefs: ['SME-9.23'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 50, headingStyle: 'note' },
      category: 'presentation',
    },
    {
      code: 'DISC.CAPITAL',
      title: 'Capital management',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'hasExternalCapitalRequirements',
      purpose: 'Discloses externally imposed capital requirements.',
      narrative:
        'Where the entity is subject to externally imposed capital requirements, the nature of those requirements, how they are incorporated into capital management, and whether the entity has complied with them during the period are disclosed. If the entity has not complied, the consequences of non-compliance are disclosed.',
      standards: [S(3)],
      sectionReferences: [S(3)],
      crossReferences: ['DISC.BASIS'],
      checklistRefs: ['SME-3.1'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 55, headingStyle: 'note' },
      category: 'presentation',
    },
    {
      code: 'DISC.TRANSITION',
      title: 'Transition to the IFRS for SMEs',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'isFirstTimeIfrsSmeAdopter',
      purpose: 'Discloses the effect of first-time adoption of the IFRS for SMEs.',
      narratives: [
        'These are the entity’s first financial statements prepared in accordance with the IFRS for SMEs. The date of transition and the accounting policies applied under the previous financial reporting framework are disclosed.',
        'Reconciliations of equity and profit or loss reported under the previous framework to equity and profit or loss under the IFRS for SMEs are presented, together with any exemptions elected under Section 35.',
      ],
      table: smePolicyChangeTable(),
      standards: [S(35)],
      sectionReferences: [S(35)],
      crossReferences: ['DISC.BASIS', 'DISC.POLICIES'],
      dependencies: ['POL.BASIS'],
      checklistRefs: ['SME-35.12', 'SME-35.13'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 5, headingStyle: 'note' },
      category: 'presentation',
    },
    {
      code: 'DISC.BIOLOGICAL',
      title: 'Biological assets (agriculture)',
      requirement: 'optional',
      disclosureClass: 'conditional',
      conditionKey: 'industryAgriculture',
      purpose: 'Discloses biological assets under specialised activities.',
      narrative:
        'Biological assets are measured at fair value less costs to sell, with changes recognised in profit or loss, unless fair value cannot be measured reliably without undue cost or effort. The reconciliation of biological assets is set out below.',
      table: smeBiologicalTable(),
      standards: [S(34)],
      sectionReferences: [S(34)],
      crossReferences: ['DISC.POLICIES'],
      checklistRefs: ['SME-34.7'],
      validationRules: ['FW.DISCLOSURE_COMPLETE'],
      presentationHints: { sortOrder: 240, headingStyle: 'note' },
      category: 'industry',
      industryApplicability: ['agriculture'],
    },
  ];
}
