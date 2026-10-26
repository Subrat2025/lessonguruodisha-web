// /app/lib/osepaBooks.js — official OSEPA (Odisha State Education Project Authority)
// classwise book list, structured with inferred subject.  Used by the admin
// "🔄 Sync OSEPA Books" import endpoint.  Idempotent (upsert by class+name).

// Emoji + colour palette per subject — keeps the Books Library visually varied.
const SUBJECT_META = {
  Odia:           { emoji: '📖', color: 'from-emerald-500 to-teal-600'    },
  'Odia Grammar': { emoji: '📚', color: 'from-emerald-600 to-green-700'   },
  English:        { emoji: '🇬🇧', color: 'from-sky-500 to-blue-600'         },
  'English Grammar': { emoji: '🇬🇧', color: 'from-sky-600 to-indigo-700'    },
  Hindi:          { emoji: '🇮🇳', color: 'from-orange-500 to-red-600'      },
  'Hindi Grammar':{ emoji: '🇮🇳', color: 'from-orange-600 to-red-700'      },
  Sanskrit:       { emoji: '🕉️',  color: 'from-amber-500 to-orange-600'    },
  'Sanskrit Grammar': { emoji: '🕉️', color: 'from-amber-600 to-orange-700' },
  Mathematics:    { emoji: '📐', color: 'from-violet-500 to-purple-600'   },
  'Mathematics (Algebra)':  { emoji: '📐', color: 'from-violet-500 to-purple-600' },
  'Mathematics (Geometry)': { emoji: '📏', color: 'from-purple-500 to-fuchsia-600' },
  Science:        { emoji: '🔬', color: 'from-cyan-500 to-blue-600'       },
  Physics:        { emoji: '⚛️',  color: 'from-cyan-600 to-sky-700'        },
  Biology:        { emoji: '🌱', color: 'from-green-500 to-emerald-600'   },
  'Social Science': { emoji: '🌍', color: 'from-yellow-500 to-amber-600'  },
  'History & Civics': { emoji: '🏛️', color: 'from-amber-500 to-yellow-700' },
  'Geography & Economics': { emoji: '🗺️', color: 'from-lime-500 to-green-600' },
  EVS:            { emoji: '🌿', color: 'from-lime-500 to-emerald-600'    },
  Arts:           { emoji: '🎨', color: 'from-pink-500 to-rose-600'       },
  'Physical Education': { emoji: '🏃', color: 'from-red-500 to-rose-600'  },
  'Skill Development':  { emoji: '🛠️', color: 'from-slate-500 to-slate-700' },
  General:        { emoji: '📗', color: 'from-teal-500 to-cyan-600'       },
}

const OSEPA_BOOKS = [
  // ─── Class 1 ───
  { class: 1, subject: 'Odia',        name: 'ଝୁଲଣା ଶ୍ରେଣୀ ୧' },
  { class: 1, subject: 'Mathematics', name: 'Ganita Khela' },
  // ─── Class 2 ───
  { class: 2, subject: 'Odia',        name: 'ଝୁଲଣା ଦ୍ବିତୀୟ ଶ୍ରେଣୀ' },
  { class: 2, subject: 'Mathematics', name: 'Majare Majare Ganita' },
  // ─── Class 3 ───
  { class: 3, subject: 'Odia',        name: 'ଭାଷା ମହକ 1' },
  { class: 3, subject: 'EVS',         name: 'ଆମ ବିଚିତ୍ର ପୃଥିବୀ' },
  { class: 3, subject: 'Mathematics', name: 'ଗଣିତ ମେଳା' },
  { class: 3, subject: 'General',     name: 'ଇନ୍ଦ୍ରଧନୁ' },
  { class: 3, subject: 'Physical Education', name: 'ଖେଳ ଯୋଗ' },
  { class: 3, subject: 'Arts',        name: 'Pallavi' },
  // ─── Class 4 ───
  { class: 4, subject: 'Odia',        name: 'ଭାଷା ମହକ 2' },
  { class: 4, subject: 'General',     name: 'ଇନ୍ଦ୍ରଧନୁ' },
  { class: 4, subject: 'Mathematics', name: 'ଗଣିତ ମେଳା' },
  { class: 4, subject: 'EVS',         name: 'ଆମ ବିଚିତ୍ର ବିଶ୍ୱ' },
  { class: 4, subject: 'Arts',        name: 'ପଲ୍ଲବୀ' },
  { class: 4, subject: 'Physical Education', name: 'Khela o Joga' },
  // ─── Class 5 ───
  { class: 5, subject: 'EVS',         name: 'ଆମ ବିଚିତ୍ର ବିଶ୍ୱ' },
  { class: 5, subject: 'Odia',        name: 'ଭାଷା ମହକ 3' },
  { class: 5, subject: 'Arts',        name: 'ପଲ୍ଲବୀ' },
  { class: 5, subject: 'Physical Education', name: 'ଖେଳ ଯୋଗ' },
  { class: 5, subject: 'Mathematics', name: 'ଗଣିତ ମେଳା' },
  { class: 5, subject: 'Arts',        name: 'ନବରସ' },
  // ─── Class 6 ───
  { class: 6, subject: 'English',     name: 'Jasmine' },
  { class: 6, subject: 'Hindi',       name: 'ହିନ୍ଦୀ କଳିକା' },
  { class: 6, subject: 'Arts',        name: 'କଳାକୁଞ୍ଜ' },
  { class: 6, subject: 'Physical Education', name: 'ଖେଳ ଶିକ୍ଷା' },
  { class: 6, subject: 'Skill Development',  name: 'କୌଶଳ ବୋଧ' },
  { class: 6, subject: 'Mathematics', name: 'ଗଣିତ ପ୍ରକାଶ' },
  { class: 6, subject: 'Odia',        name: 'ସାହିତ୍ୟ ସୁଧା' },
  { class: 6, subject: 'Sanskrit',    name: 'ସଂସ୍କୃତ କଳିକା - 1' },
  { class: 6, subject: 'Science',     name: 'ଜିଜ୍ଞାସା' },
  { class: 6, subject: 'Social Science', name: 'ସାମାଜିକ ବିଜ୍ଞାନ Adhayan: Bharat O Ama Pruthibi' },
  { class: 6, subject: 'Science',     name: 'ତଲାସ୍ (Tallash)' },
  // ─── Class 7 ───
  { class: 7, subject: 'Hindi',       name: 'ହିନ୍ଦୀ କଳିକା' },
  { class: 7, subject: 'English',     name: 'Jasmine' },
  { class: 7, subject: 'Arts',        name: 'କୃତି' },
  { class: 7, subject: 'Physical Education', name: 'ଖେଳ ଶିକ୍ଷା' },
  { class: 7, subject: 'Skill Development',  name: 'କୌଶଳ ବୋଧ' },
  { class: 7, subject: 'Mathematics', name: 'ଗଣିତ ପ୍ରକାଶ' },
  { class: 7, subject: 'Odia',        name: 'ସାହିତ୍ୟ ସୁମନ' },
  { class: 7, subject: 'Sanskrit',    name: 'ସଂସ୍କୃତ କଳିକା -2' },
  { class: 7, subject: 'Science',     name: 'ଜିଜ୍ଞାସା' },
  { class: 7, subject: 'Social Science', name: 'ସାମାଜିକ ବିଜ୍ଞାନ Adhayan: Bharat O Ama Pruthibi' },
  { class: 7, subject: 'Science',     name: 'ତଲାସ୍ (Tallash)' },
  // ─── Class 8 ───
  { class: 8, subject: 'English',     name: 'Jasmine' },
  { class: 8, subject: 'Hindi',       name: 'ହିନ୍ଦୀ କଳିକା' },
  { class: 8, subject: 'Science',     name: 'ଜିଜ୍ଞାସା' },
  { class: 8, subject: 'Physical Education', name: 'ଖେଳ ଶିକ୍ଷା' },
  { class: 8, subject: 'Skill Development',  name: 'କୌଶଳ ବୋଧ' },
  { class: 8, subject: 'Arts',        name: 'କୃତି' },
  { class: 8, subject: 'Mathematics', name: 'ଗଣିତ ପ୍ରକାଶ' },
  { class: 8, subject: 'Odia',        name: 'ସାହିତ୍ୟ ସୁରଭି' },
  { class: 8, subject: 'Sanskrit',    name: 'ସଂସ୍କୃତ କଳିକା -3' },
  { class: 8, subject: 'Social Science', name: 'ସାମାଜିକ ବିଜ୍ଞାନ' },
  { class: 8, subject: 'Science',     name: 'ତଲାସ୍ (Tallash)' },
  // ─── Class 9 ───
  { class: 9, subject: 'Odia',        name: 'ସାହିତ୍ୟ ଧାରା' },
  { class: 9, subject: 'Odia Grammar',name: 'ମାଧ୍ୟମିକ ବ୍ୟାକରଣ' },
  { class: 9, subject: 'English Grammar', name: 'Learn & Practice Grammer' },
  { class: 9, subject: 'English',     name: 'Skills of Communicative English' },
  { class: 9, subject: 'Sanskrit',    name: 'Sanskruta Ballari' },
  { class: 9, subject: 'Sanskrit Grammar', name: 'ସଂସ୍କୃତ ବ୍ୟାକରଣ ପ୍ରଦୀପ' },
  { class: 9, subject: 'Hindi',       name: 'Hindi Manjari' },
  { class: 9, subject: 'Hindi Grammar', name: 'Hindi Byakaran aur Prayog' },
  { class: 9, subject: 'Mathematics (Algebra)',  name: 'ମାଧ୍ୟମିକ ବୀଜଗଣିତ' },
  { class: 9, subject: 'Mathematics (Geometry)', name: 'ମାଧ୍ୟମିକ ଜ୍ୟାମିତି' },
  { class: 9, subject: 'Physics',     name: 'ଭୌତିକ ବିଜ୍ଞାନ' },
  { class: 9, subject: 'Biology',     name: 'ଜୀବ ବିଜ୍ଞାନ' },
  { class: 9, subject: 'History & Civics',      name: 'ଇତିହାସ ଓ ରାଜନୀତି ବିଜ୍ଞାନ' },
  { class: 9, subject: 'Geography & Economics', name: 'ଭୂଗୋଳ ଓ ଅର୍ଥନୀତି' },
  // ─── Class 10 ───
  { class: 10, subject: 'Odia',       name: 'ସାହିତ୍ୟ ସିନ୍ଧୁ' },
  { class: 10, subject: 'Odia Grammar', name: 'ମାଧ୍ୟମିକ ବ୍ୟାକରଣ' },
  { class: 10, subject: 'English',    name: 'Skills of Communicative English' },
  { class: 10, subject: 'English Grammar', name: 'Learn & Practice Grammer' },
  { class: 10, subject: 'Sanskrit',   name: 'Sanskruta Sahitya Manjari' },
  { class: 10, subject: 'Sanskrit Grammar', name: 'ସଂସ୍କୃତ ବ୍ୟାକରଣ ପ୍ରକାଶ' },
  { class: 10, subject: 'Hindi',      name: 'Hindi Saurav' },
  { class: 10, subject: 'Hindi Grammar', name: 'Madhyamika Hindi Byakaran' },
  { class: 10, subject: 'Mathematics (Algebra)',  name: 'ମାଧ୍ୟମିକ ବୀଜଗଣିତ' },
  { class: 10, subject: 'Mathematics (Geometry)', name: 'ମାଧ୍ୟମିକ ଜ୍ୟାମିତି' },
  { class: 10, subject: 'Physics',    name: 'ଭୌତିକ ବିଜ୍ଞାନ' },
  { class: 10, subject: 'Biology',    name: 'ଜୀବ ବିଜ୍ଞାନ' },
  { class: 10, subject: 'History & Civics',      name: 'ଇତିହାସ ଓ ରାଜନୀତି ବିଜ୍ଞାନ' },
  { class: 10, subject: 'Geography & Economics', name: 'ଭୂଗୋଳ ଓ ଅର୍ଥନୀତି' },
  { class: 10, subject: 'Geography & Economics', name: 'ଭୂଗୋଳ ଓ ଅର୍ଥନୀତି (Additional Chapters)' },
]

function bookMetaFor(subject) {
  return SUBJECT_META[subject] || SUBJECT_META.General
}

export { OSEPA_BOOKS, SUBJECT_META, bookMetaFor }
