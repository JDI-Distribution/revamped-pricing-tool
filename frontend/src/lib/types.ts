export interface MoqRow {
  id: number;
  moq: string;
  individualUnits: string;
  unitsPerInner: string;
  innersPerMaster: string;
}

export interface Column {
  id: number;
  efficiency: string;
  labor: string;
  unitCost: string;
  level: string;
  type: string;
  units: string;
  tabs: boolean;
  rows: Record<string, string>;
  // When set, this column's units + fill rate auto-derive from the source column
  // scaled by (this column's unitsPerInner / source's unitsPerInner)
  sourceId?:       number;
  unitsPerInner?:  string;
}

export interface ProjectFormData {
  unitWeight: string;
  costPerGram: string;
  // Raw material
  numSkus: string;
  rawMaterialSkus: string;
  leftOverInventoryCost: string;
  leftOverInventoryAbsorb: string;
  // Material intake pallets
  intakeFee: string;
  numPallets: string;
  // Outbound / finished-goods pallets
  outboundFee: string;
  outboundFeeMarkup: string;
  numFinishedPallets: string;
  // Fees
  testingFee: string;
  testingFeeMarkup: string;
  // Setup / QA fee (separate our-cost vs customer price)
  setupFeeOur: string;
  setupFeeCustomer: string;
  ppuDenominator: string;
  // Material markups
  materialOverage: string;
  rawMaterialMarkup: string;
  intakeFeeMarkup: string;
  // Lead time
  leadTimeBufferDays: string;
  startDate: string;
  // Unit weight display unit (g | oz | lb | kg | fl oz)
  unitWeightUnit: string;
}

export interface SummaryRow {
  label: string;
  customerPrice: number;
  ourCosts: number;
}

export interface SummaryTableRow {
  label: string;
  throughput: number | null;      // units / hr (nominal rate × efficiency)
  leadTimeWeeks: number | null;   // (productionDays + bufferDays) / 5 working days
  costPerUnit: number | null;     // customer price per unit = totalPrice / ppuDenominator
  totalWeight: number | null;     // grams
  totalUnits: number | null;
  totalCost: number | null;       // our cost
  totalPrice: number | null;      // customer price
}

export interface DetailRow {
  label: string;
  projectDetails: number | null;
  projectCosts: number | null;
  isCurrency: boolean;
}

export interface DetailSection {
  title: string;
  overageReq: number | null;
  rows: DetailRow[];
  totalCustomerCost: number;
  totalOurCost: number;
}
