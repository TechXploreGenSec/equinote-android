/**
 * Indian bank / wallet directory: display names mapped to DLT sender-id
 * fragments seen in the wild (alpha headers like HDFCBK, numeric short
 * codes like 111101). Used to auto-suggest sender IDs when the user types
 * a bank name, and to match inbox SMS to the user's own banks.
 */

export interface BankEntry {
  name: string;
  ids: string[];
}

export const BANK_DIRECTORY: BankEntry[] = [
  { name: 'HDFC Bank', ids: ['HDFCBK', 'HDFC', '146587'] },
  { name: 'State Bank of India', ids: ['SBI', 'SBIINB', 'SBICRD', 'SBICARD', '141516'] },
  { name: 'ICICI Bank', ids: ['ICICIB', 'ICICI', '142421'] },
  { name: 'Axis Bank', ids: ['AXISBK', 'AXIS'] },
  { name: 'Kotak Mahindra Bank', ids: ['KOTAK', 'KOTAKBK', '100811', '111000'] },
  { name: 'Canara Bank', ids: ['CANBNK', 'CANARA', 'CNRB', '110111'] },
  { name: 'Punjab National Bank', ids: ['PNB', 'PNBINB'] },
  { name: 'Bank of Baroda', ids: ['BOB', 'BARODA', 'BOBINB'] },
  { name: 'Union Bank of India', ids: ['UNION', 'UNIONBK', '100026'] },
  { name: 'IDFC FIRST Bank', ids: ['IDFC', 'IDFCFB', 'IDFCBK', '111101'] },
  { name: 'Yes Bank', ids: ['YESBNK', 'YES'] },
  { name: 'IndusInd Bank', ids: ['INDUS', 'INDUSIND', '126666'] },
  { name: 'Federal Bank', ids: ['FEDBNK', 'FEDERAL', '181818'] },
  { name: 'RBL Bank', ids: ['RBL', '120011'] },
  { name: 'IDBI Bank', ids: ['IDBI', '111444'] },
  { name: 'Bank of India', ids: ['BOI', '126995'] },
  { name: 'Central Bank of India', ids: ['CENTRAL', 'CENBNK'] },
  { name: 'Indian Bank', ids: ['INDBNK', 'INDIAN'] },
  { name: 'Indian Overseas Bank', ids: ['IOB'] },
  { name: 'UCO Bank', ids: ['UCO'] },
  { name: 'Bank of Maharashtra', ids: ['MAHABNK', 'MAHARASHTRA'] },
  { name: 'Punjab & Sind Bank', ids: ['PSB'] },
  { name: 'Karnataka Bank', ids: ['KBL', 'KARNATAKA', '128119'] },
  { name: 'South Indian Bank', ids: ['SIB'] },
  { name: 'Karur Vysya Bank', ids: ['KVB', 'KARUR', '191600'] },
  { name: 'Tamilnad Mercantile Bank', ids: ['TMB', '111921'] },
  { name: 'Dhanlaxmi Bank', ids: ['DHANLAXMI', 'DHANBANK', '113000'] },
  { name: 'City Union Bank', ids: ['CUB', '111904'] },
  { name: 'DCB Bank', ids: ['DCB', '130000'] },
  { name: 'AU Small Finance Bank', ids: ['AUBANK', 'AU', '120012'] },
  { name: 'Equitas Small Finance Bank', ids: ['EQUITAS', '115551'] },
  { name: 'Ujjivan Small Finance Bank', ids: ['UJJIVAN'] },
  { name: 'Jana Small Finance Bank', ids: ['JANA'] },
  { name: 'Fincare Small Finance Bank', ids: ['FINCARE', '107750'] },
  { name: 'Bandhan Bank', ids: ['BANDHAN', '154321'] },
  { name: 'CSB Bank', ids: ['CSB'] },
  { name: 'Jammu & Kashmir Bank', ids: ['JKBANK', '133333'] },
  { name: 'Citibank', ids: ['CITI', '152484'] },
  { name: 'American Express', ids: ['AMEX', 'AEITSM'] },
  { name: 'Standard Chartered', ids: ['STANCHART', 'SCB'] },
  { name: 'HSBC', ids: ['HSBC', '100022'] },
  { name: 'DBS Bank', ids: ['DBS'] },
  { name: 'Paytm Payments Bank', ids: ['PAYTM', 'PAYTMBK'] },
  { name: 'Airtel Payments Bank', ids: ['AIRTEL', 'AIRTELBK', '171717'] },
  { name: 'Jio Payments Bank', ids: ['JIO', 'JIOPAY'] },
  { name: 'Fino Payments Bank', ids: ['FINO'] },
  { name: 'NSDL Payments Bank', ids: ['NSDL', '111555'] },
  { name: 'India Post Payments Bank', ids: ['IPPB', 'POST'] },
  { name: 'Amazon Pay', ids: ['AMAZON', 'AMZNPAY', 'APL'] },
  { name: 'PhonePe', ids: ['PHONEPE'] },
  { name: 'Google Pay', ids: ['GPAY', 'GOOGLEPAY'] },
  { name: 'Mobikwik', ids: ['MOBIKWIK'] },
  { name: 'Freecharge', ids: ['FREECHARGE'] },
  { name: 'Ola Money', ids: ['OLAMONEY'] },
  { name: 'Bajaj Finserv', ids: ['BAJAJ', 'BAJAJFIN'] },
  { name: 'Tata Capital', ids: ['TATA'] },
  { name: 'Aditya Birla Finance', ids: ['ADITYA', 'ABFL'] },
  { name: 'Muthoot Finance', ids: ['MUTHOOT'] },
  { name: 'Manappuram Finance', ids: ['MANAPPURAM'] },
  { name: 'Shriram Finance', ids: ['SHRIRAM'] },
  { name: 'Cholamandalam', ids: ['CHOLA'] },
  { name: 'Sundaram Finance', ids: ['SUNDARAM'] },
  { name: 'CRED', ids: ['CRED'] },
  { name: 'Slice', ids: ['SLICE'] },
  { name: 'Fi Money', ids: ['FI'] },
  { name: 'Jupiter', ids: ['JUPITER'] },
  { name: 'Niyo', ids: ['NIYO'] },
  { name: 'BHIM UPI', ids: ['BHIM', 'NPCI', 'UPI'] },
];

/**
 * Normalize an inbox sender ("JD-HDFCBK-S", "140001", "AMAZON") to its
 * brand token: strip operator prefix, strip -P/-S/-T/-G suffix, uppercase.
 */
export function brandOfSender(sender: string): string {
  let s = (sender || '').trim().toUpperCase();
  const dash = s.lastIndexOf('-');
  if (dash >= 0) {
    const tail = s.slice(dash + 1);
    // Keep 6-char brand headers; drop 1-letter category suffixes.
    s = tail.length === 1 ? s.slice(0, dash) : tail;
    // If a prefix remains (XY-BRAND), take the part after the first dash.
    const first = s.indexOf('-');
    if (first >= 0) s = s.slice(first + 1);
  }
  return s;
}

/** Directory entries whose name matches free text (user's bank name). */
export function findBanksByName(text: string): BankEntry[] {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !['bank', 'of', 'the', 'and', 'pay', 'finance'].includes(t));
  if (tokens.length === 0) return [];
  return BANK_DIRECTORY.filter((entry) => {
    const name = entry.name.toLowerCase();
    return tokens.some((t) => name.includes(t));
  });
}

/** All sender fragments implied by a bank name via the directory. */
export function senderIdsForBankName(bankName?: string): string[] {
  if (!bankName) return [];
  const ids = new Set<string>();
  for (const entry of findBanksByName(bankName)) {
    for (const id of entry.ids) ids.add(id);
  }
  return [...ids];
}
