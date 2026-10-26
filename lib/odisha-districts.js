// 30 districts of Odisha (English canonical names used as the stable key).
export const ODISHA_DISTRICTS = [
  'Angul', 'Balangir', 'Balasore', 'Bargarh', 'Bhadrak', 'Boudh', 'Cuttack',
  'Deogarh', 'Dhenkanal', 'Gajapati', 'Ganjam', 'Jagatsinghpur', 'Jajpur',
  'Jharsuguda', 'Kalahandi', 'Kandhamal', 'Kendrapara', 'Kendujhar', 'Khordha',
  'Koraput', 'Malkangiri', 'Mayurbhanj', 'Nabarangpur', 'Nayagarh', 'Nuapada',
  'Puri', 'Rayagada', 'Sambalpur', 'Subarnapur', 'Sundargarh',
]
export const isValidDistrict = (d) => ODISHA_DISTRICTS.includes(String(d || '').trim())

// Odia names keyed by the stable English name. Used for bilingual display
// like "ଅନୁଗୋଳ · Angul". Kept as a plain map so callers can fall back to the
// English name if a key is ever missing.
export const ODISHA_DISTRICTS_ODIA = {
  Angul: 'ଅନୁଗୋଳ',
  Balangir: 'ବଲାଙ୍ଗୀର',
  Balasore: 'ବାଲେଶ୍ୱର',
  Bargarh: 'ବରଗଡ଼',
  Bhadrak: 'ଭଦ୍ରକ',
  Boudh: 'ବୌଦ୍ଧ',
  Cuttack: 'କଟକ',
  Deogarh: 'ଦେବଗଡ଼',
  Dhenkanal: 'ଢେଙ୍କାନାଳ',
  Gajapati: 'ଗଜପତି',
  Ganjam: 'ଗଞ୍ଜାମ',
  Jagatsinghpur: 'ଜଗତସିଂହପୁର',
  Jajpur: 'ଯାଜପୁର',
  Jharsuguda: 'ଝାରସୁଗୁଡ଼ା',
  Kalahandi: 'କଳାହାଣ୍ଡି',
  Kandhamal: 'କନ୍ଧମାଳ',
  Kendrapara: 'କେନ୍ଦ୍ରାପଡ଼ା',
  Kendujhar: 'କେନ୍ଦୁଝର',
  Khordha: 'ଖୋର୍ଦ୍ଧା',
  Koraput: 'କୋରାପୁଟ',
  Malkangiri: 'ମାଲକାନଗିରି',
  Mayurbhanj: 'ମୟୂରଭଞ୍ଜ',
  Nabarangpur: 'ନବରଙ୍ଗପୁର',
  Nayagarh: 'ନୟାଗଡ଼',
  Nuapada: 'ନୂଆପଡ଼ା',
  Puri: 'ପୁରୀ',
  Rayagada: 'ରାୟଗଡ଼ା',
  Sambalpur: 'ସମ୍ବଲପୁର',
  Subarnapur: 'ସୁବର୍ଣ୍ଣପୁର',
  Sundargarh: 'ସୁନ୍ଦରଗଡ଼',
}

// "ଅନୁଗୋଳ · Angul" — Odia first, English second. Falls back gracefully.
export const districtLabel = (d) => {
  const en = String(d || '').trim()
  const or = ODISHA_DISTRICTS_ODIA[en]
  return or ? `${or} · ${en}` : en
}
