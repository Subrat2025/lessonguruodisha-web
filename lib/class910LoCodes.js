// /app/lib/class910LoCodes.js
// NCERT/NCF Secondary Stage (2023) aligned Learning Outcomes for Class 9 & Class 10.
// Code prefixes match the existing OCF naming convention used for Class 1-8 in the DB:
//   M = Mathematics, SCI = Science, SS = Social Science, EN = English, OD = Odia
// Curriculum goals use CG-9-N / CG-10-N pattern.
//
// Descriptions are written bilingually (Odia + English) where possible.
// Source: NCERT Learning Outcomes Class IX–X (English / Hindi versions, adapted to Odisha context).

const CLASS_9_CODES = [
  // ---- Curriculum Goals (5) ----
  { code: 'CG-9-1', class: 9, subject: 'General', description: 'ଶିକ୍ଷାର୍ଥୀ ବୌଦ୍ଧିକ କୌଶଳ ବିକାଶ କରିବେ ଯଥା – ସମସ୍ୟା ସମାଧାନ, ବିଶ୍ଳେଷଣ ଓ ଯୁକ୍ତିଯୁକ୍ତ ଚିନ୍ତା । (Develops intellectual skills — problem-solving, analysis & critical thinking.)' },
  { code: 'CG-9-2', class: 9, subject: 'General', description: 'ବିଷୟ ସମ୍ବନ୍ଧୀୟ ଧାରଣା ଓ ସମ୍ବନ୍ଧଗୁଡ଼ିକୁ ବୁଝନ୍ତି ଓ ବାସ୍ତବ ଜୀବନରେ ପ୍ରୟୋଗ କରନ୍ତି । (Understands subject concepts and applies them to real-life contexts.)' },
  { code: 'CG-9-3', class: 9, subject: 'General', description: 'ସ୍ୱାଧୀନ ଭାବେ ଗବେଷଣା ଓ ଅନୁସନ୍ଧାନ କରିବାର କ୍ଷମତା ବିକଶିତ କରନ୍ତି । (Develops independent inquiry and research skills.)' },
  { code: 'CG-9-4', class: 9, subject: 'General', description: 'ଭାଷା, ଗଣିତ ଓ ଡିଜିଟାଲ୍ ସାକ୍ଷରତା ବିକଶିତ କରନ୍ତି । (Develops language, numerical and digital literacy.)' },
  { code: 'CG-9-5', class: 9, subject: 'General', description: 'ସାମାଜିକ-ଭାବନାତ୍ମକ ଦକ୍ଷତା ଓ ମୂଲ୍ୟବୋଧ ବିକଶିତ କରନ୍ତି । (Develops social-emotional skills and core values.)' },

  // ---- Mathematics (15) ----
  { code: 'M 901', class: 9, subject: 'Mathematics', description: 'ବାସ୍ତବ ସଂଖ୍ୟା (Real Numbers) ର ଗୁଣଗୁଡ଼ିକୁ ବୁଝନ୍ତି ଏବଂ ସେଗୁଡ଼ିକୁ ସଂଖ୍ୟା ରେଖାରେ ସ୍ଥାନ ନିର୍ଣ୍ଣୟ କରନ୍ତି ।' },
  { code: 'M 902', class: 9, subject: 'Mathematics', description: 'ବହୁପଦୀ (Polynomials) ର ଗୁଣନଖଣ୍ଡ (factorisation), ଶୂନ୍ୟ ସ୍ଥାନ ଓ ସମୀକରଣ ସ୍ଥିର କରନ୍ତି ।' },
  { code: 'M 903', class: 9, subject: 'Mathematics', description: 'ସ୍ଥାନାଙ୍କ ଜ୍ୟାମିତି (Coordinate Geometry) ବ୍ୟବହାର କରି ସ୍ଥାନର ସ୍ଥିତି ନିର୍ଣ୍ଣୟ କରନ୍ତି ।' },
  { code: 'M 904', class: 9, subject: 'Mathematics', description: 'ଦୁଇ ଚଳରେ ଥିବା ସରଳ ସମୀକରଣ ସମ୍ବଳିତ ସମସ୍ୟା ସମାଧାନ କରନ୍ତି (Linear Equations in Two Variables).' },
  { code: 'M 905', class: 9, subject: 'Mathematics', description: 'ଇୟୁକ୍ଲିଡଙ୍କ ଜ୍ୟାମିତିର ସ୍ୱୟଂସିଦ୍ଧ (axioms) ଓ ପ୍ରମେୟ (theorems) ବୁଝନ୍ତି ।' },
  { code: 'M 906', class: 9, subject: 'Mathematics', description: 'ରେଖା ଓ କୋଣ ସମ୍ବନ୍ଧୀୟ ପ୍ରମେୟଗୁଡ଼ିକୁ ପ୍ରମାଣ କରନ୍ତି ।' },
  { code: 'M 907', class: 9, subject: 'Mathematics', description: 'ତ୍ରିଭୁଜ ର ସର୍ବସମତା (Congruence) ଶର୍ତ୍ତ ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'M 908', class: 9, subject: 'Mathematics', description: 'ଚତୁର୍ଭୁଜ, ସମାନ୍ତରାଳରେଖା ଚତୁର୍ଭୁଜ ଓ ତ୍ରିଭୁଜର ଗୁଣ ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'M 909', class: 9, subject: 'Mathematics', description: 'ବୃତ୍ତ ସମ୍ବନ୍ଧୀୟ ପ୍ରମେୟ (chord, arc, sector) ପ୍ରମାଣ କରନ୍ତି ।' },
  { code: 'M 910', class: 9, subject: 'Mathematics', description: 'ଷ୍ଠାନୀୟ ଜ୍ୟାମିତି (Heron’s formula) ବ୍ୟବହାର କରି ତ୍ରିଭୁଜର କ୍ଷେତ୍ରଫଳ ସ୍ଥିର କରନ୍ତି ।' },
  { code: 'M 911', class: 9, subject: 'Mathematics', description: 'ଘନ ଆକୃତି ର ଆୟତନ ଓ ସମ୍ପୂର୍ଣ୍ଣ ପୃଷ୍ଠଫଳ ସ୍ଥିର କରନ୍ତି (Cube, Cylinder, Cone, Sphere).' },
  { code: 'M 912', class: 9, subject: 'Mathematics', description: 'ତଥ୍ୟ ସଂଗ୍ରହ, ବର୍ଗୀକରଣ ଓ ସାଂଖ୍ୟିକ ଚିତ୍ର ତିଆରି କରନ୍ତି (Statistics — bar graph, histogram).' },
  { code: 'M 913', class: 9, subject: 'Mathematics', description: 'ଅନୁଭବଗତ ସମ୍ଭାବନା (Empirical Probability) ର ସରଳ ସମସ୍ୟା ସମାଧାନ କରନ୍ତି ।' },
  { code: 'M 914', class: 9, subject: 'Mathematics', description: 'ଗାଣିତିକ ତର୍କ ବ୍ୟବହାର କରି ତଥ୍ୟ ସମୂହକୁ ସମାଲୋଚନା କରନ୍ତି ।' },
  { code: 'M 915', class: 9, subject: 'Mathematics', description: 'ଦୈନନ୍ଦିନ ଜୀବନରୁ ଗଣିତର ସମସ୍ୟା ସୃଷ୍ଟି କରନ୍ତି ଓ ସମାଧାନ କରନ୍ତି ।' },

  // ---- Science (15) ----
  { code: 'SCI 901', class: 9, subject: 'Science', description: 'ପଦାର୍ଥ ର ସ୍ଥିତି (solid, liquid, gas) ଓ ସେମାନଙ୍କ ଗୁଣ ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 902', class: 9, subject: 'Science', description: 'ପରମାଣୁ ଓ ଅଣୁ (Atoms and Molecules) ର ସଂରଚନା ଓ ସଂଖ୍ୟା ବୁଝନ୍ତି ।' },
  { code: 'SCI 903', class: 9, subject: 'Science', description: 'ପରମାଣୁର ସଂରଚନା — ପ୍ରୋଟନ, ନ୍ୟୁଟ୍ରନ, ଇଲେକ୍ଟ୍ରନ ର ସ୍ଥାନ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SCI 904', class: 9, subject: 'Science', description: 'ସଜୀବ କୋଷ (Cell) ର ସଂରଚନା ଓ କାର୍ଯ୍ୟ ଚିହ୍ନଟ କରନ୍ତି ।' },
  { code: 'SCI 905', class: 9, subject: 'Science', description: 'ଶ୍ୱାସୋଚ୍ଛ୍ୱାସ ଓ ଅନ୍ୟ ସଜୀବ କ୍ରିୟା (tissues) ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 906', class: 9, subject: 'Science', description: 'ଗତି ର ସମୀକରଣ (equations of motion) ବ୍ୟବହାର କରି ସମସ୍ୟା ସମାଧାନ କରନ୍ତି ।' },
  { code: 'SCI 907', class: 9, subject: 'Science', description: 'ବଳ ଓ ନ୍ୟୁଟନଙ୍କ ସୂତ୍ର (Newton’s laws) ର ପ୍ରୟୋଗ କରନ୍ତି ।' },
  { code: 'SCI 908', class: 9, subject: 'Science', description: 'ମହାକର୍ଷଣ (Gravitation) ଓ ଭର, ଓଜନ ସମ୍ବନ୍ଧୀୟ ସମସ୍ୟା ସମାଧାନ କରନ୍ତି ।' },
  { code: 'SCI 909', class: 9, subject: 'Science', description: 'କାର୍ଯ୍ୟ, ଶକ୍ତି ଓ କ୍ଷମତା (Work, Energy, Power) ର ସମ୍ବନ୍ଧ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SCI 910', class: 9, subject: 'Science', description: 'ଶବ୍ଦ (Sound) ର ସୃଷ୍ଟି, ପ୍ରସାର ଓ ପ୍ରତିଫଳନ ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 911', class: 9, subject: 'Science', description: 'ସ୍ୱାସ୍ଥ୍ୟ ଓ ରୋଗ (health and diseases) ର କାରଣ, ସଞ୍ଚରଣ ଓ ପ୍ରତିରୋଧ ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 912', class: 9, subject: 'Science', description: 'ଖାଦ୍ୟ ଉତ୍ପାଦନରେ ଉନ୍ନତି (food improvement) ର ଉପାୟ ଚିହ୍ନଟ କରନ୍ତି ।' },
  { code: 'SCI 913', class: 9, subject: 'Science', description: 'ପ୍ରାକୃତିକ ଉତ୍ସ — ବାୟୁ, ଜଳ, ମୃତ୍ତିକା (natural resources) ସଂରକ୍ଷଣ ର ଉପାୟ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SCI 914', class: 9, subject: 'Science', description: 'ସଜୀବ ଓ ନିର୍ଜୀବ ବସ୍ତୁ ର ବର୍ଗୀକରଣ ଓ ବୈଶିଷ୍ଟ୍ୟ ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 915', class: 9, subject: 'Science', description: 'ବୈଜ୍ଞାନିକ ପଦ୍ଧତି ବ୍ୟବହାର କରି ସରଳ ପରୀକ୍ଷଣ ଯୋଜନା ଓ ସମ୍ପାଦନ କରନ୍ତି ।' },

  // ---- Social Science (15) ----
  { code: 'SS 901', class: 9, subject: 'Social Science', description: 'ଫରାସୀ ବିପ୍ଳବ (French Revolution) ର କାରଣ, ଘଟଣା ଓ ପ୍ରଭାବ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SS 902', class: 9, subject: 'Social Science', description: 'ସୋଭିଏତ ସମାଜବାଦ ଓ ରୁଷୀୟ ବିପ୍ଳବ (Russian Revolution) ର ବିଶ୍ଳେଷଣ କରନ୍ତି ।' },
  { code: 'SS 903', class: 9, subject: 'Social Science', description: 'ନାଜିଜମ ଓ ହିଟଲରଙ୍କ ଉତ୍ଥାନ ର ସାମାଜିକ-ରାଜନୈତିକ କାରଣ ଚିହ୍ନଟ କରନ୍ତି ।' },
  { code: 'SS 904', class: 9, subject: 'Social Science', description: 'ବନ ଓ ଆଦିବାସୀ ସମାଜ (forest society and colonialism) ର ସମ୍ପର୍କ ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 905', class: 9, subject: 'Social Science', description: 'ଭାରତର ଭୌତିକ ବୈଶିଷ୍ଟ୍ୟ (physical features) ର ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 906', class: 9, subject: 'Social Science', description: 'ଭାରତର ନଦୀ, ଜଳବାୟୁ ଓ ପ୍ରାକୃତିକ ବନସ୍ପତି ର ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 907', class: 9, subject: 'Social Science', description: 'ଜନସଂଖ୍ୟା (population) ର ବଣ୍ଟନ, ଘନତା ଓ ସମସ୍ୟା ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SS 908', class: 9, subject: 'Social Science', description: 'ଗଣତନ୍ତ୍ର (democracy) ର ବୈଶିଷ୍ଟ୍ୟ ଓ ଆବଶ୍ୟକତା ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 909', class: 9, subject: 'Social Science', description: 'ସମ୍ବିଧାନ ର ସୃଷ୍ଟି ଓ ମୌଳିକ ବୈଶିଷ୍ଟ୍ୟ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SS 910', class: 9, subject: 'Social Science', description: 'ସଂସଦ, ନ୍ୟାୟପାଳିକା ଓ କାର୍ଯ୍ୟପାଳିକା ର ଭୂମିକା ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 911', class: 9, subject: 'Social Science', description: 'ନିର୍ବାଚନ ଓ ରାଜନୈତିକ ଦଳ ର କାର୍ଯ୍ୟ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SS 912', class: 9, subject: 'Social Science', description: 'ପଲ୍ଲୀ ଅର୍ଥବ୍ୟବସ୍ଥା (village economy) ଓ ସମ୍ବଳ ର ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 913', class: 9, subject: 'Social Science', description: 'ଦରିଦ୍ରତା (poverty) ର କାରଣ, ପରିମାପ ଓ ସମାଧାନ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SS 914', class: 9, subject: 'Social Science', description: 'ଖାଦ୍ୟ ସୁରକ୍ଷା (food security) ର ଆବଶ୍ୟକତା ଓ ସରକାରୀ ଯୋଜନା ର ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 915', class: 9, subject: 'Social Science', description: 'ଭାରତୀୟ ସମାଜର ବିଭିନ୍ନ ସାମାଜିକ ସମସ୍ୟା ର ବିଶ୍ଳେଷଣ କରନ୍ତି ।' },

  // ---- English (10) ----
  { code: 'EN 901', class: 9, subject: 'English', description: 'Reads, comprehends and interprets prose and poetry from prescribed textbooks.' },
  { code: 'EN 902', class: 9, subject: 'English', description: 'Identifies main idea, theme, characters and plot of literary texts.' },
  { code: 'EN 903', class: 9, subject: 'English', description: 'Writes structured paragraphs, formal & informal letters, and short stories.' },
  { code: 'EN 904', class: 9, subject: 'English', description: 'Uses appropriate grammar — tenses, voice, narration, modals, connectors.' },
  { code: 'EN 905', class: 9, subject: 'English', description: 'Expands vocabulary through context, synonyms, antonyms and word-formation.' },
  { code: 'EN 906', class: 9, subject: 'English', description: 'Listens to and comprehends spoken English in diverse situations.' },
  { code: 'EN 907', class: 9, subject: 'English', description: 'Speaks fluently with proper pronunciation, stress and intonation.' },
  { code: 'EN 908', class: 9, subject: 'English', description: 'Reads silently for understanding & aloud with proper expression.' },
  { code: 'EN 909', class: 9, subject: 'English', description: 'Critically appreciates poems — figures of speech, imagery, theme.' },
  { code: 'EN 910', class: 9, subject: 'English', description: 'Drafts notices, messages, diary entries, reports and articles.' },

  // ---- Odia (10) ----
  { code: 'OD 901', class: 9, subject: 'Odia', description: 'ଓଡ଼ିଆ ସାହିତ୍ୟର ବିଭିନ୍ନ ବିଭାଗ (ଗଦ୍ୟ, ପଦ୍ୟ, ନାଟକ, ଉପନ୍ୟାସ) ର ବୈଶିଷ୍ଟ୍ୟ ଚିହ୍ନଟ କରନ୍ତି ।' },
  { code: 'OD 902', class: 9, subject: 'Odia', description: 'କବିତାର ଭାବ, ଭାଷା, ଶୈଳୀ ଓ ଅଳଙ୍କାର ଚିହ୍ନଟ କରନ୍ତି ।' },
  { code: 'OD 903', class: 9, subject: 'Odia', description: 'ଗଦ୍ୟ ର ବିଷୟବସ୍ତୁ, ଚରିତ୍ର, ବାର୍ତ୍ତା ବିଶ୍ଳେଷଣ କରନ୍ତି ।' },
  { code: 'OD 904', class: 9, subject: 'Odia', description: 'ବ୍ୟାକରଣ — ସମାସ, ସନ୍ଧି, କାରକ, ବିଭକ୍ତି ର ସଠିକ ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'OD 905', class: 9, subject: 'Odia', description: 'ଅନୁଚ୍ଛେଦ, ପତ୍ର, ପ୍ରବନ୍ଧ ଓ ବର୍ଣ୍ଣନା ଲେଖନ କରନ୍ତି ।' },
  { code: 'OD 906', class: 9, subject: 'Odia', description: 'ବାକ୍ୟ ଗଠନ — ସରଳ, ଯୌଗିକ ଓ ମିଶ୍ର ବାକ୍ୟ ର ସୃଷ୍ଟି କରନ୍ତି ।' },
  { code: 'OD 907', class: 9, subject: 'Odia', description: 'ସମାନାର୍ଥକ ଓ ବିପରୀତାର୍ଥକ ଶବ୍ଦ, ସମ୍ବନ୍ଧ ବାଚକ ଶବ୍ଦ ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'OD 908', class: 9, subject: 'Odia', description: 'ଓଡ଼ିଆ ସାହିତ୍ୟର ଇତିହାସ ର ବିଭିନ୍ନ ଯୁଗ ଓ ସାହିତ୍ୟିକ ଚିହ୍ନଟ କରନ୍ତି ।' },
  { code: 'OD 909', class: 9, subject: 'Odia', description: 'ସ୍ୱାଧୀନ ଭାବେ ସୃଜନଶୀଳ ଲେଖନ ଯଥା – ଗଳ୍ପ, କବିତା ସୃଷ୍ଟି କରନ୍ତି ।' },
  { code: 'OD 910', class: 9, subject: 'Odia', description: 'ସ୍ପଷ୍ଟ ଓ ପ୍ରଭାବଶାଳୀ ଭାବେ କଥା ବାର୍ତ୍ତା, ସମ୍ଭାଷଣ ଓ ବକ୍ତୃତା ପ୍ରଦାନ କରନ୍ତି ।' },
]

const CLASS_10_CODES = [
  // ---- Curriculum Goals (5) ----
  { code: 'CG-10-1', class: 10, subject: 'General', description: 'ବୌଦ୍ଧିକ କୌଶଳ ର ବ୍ୟବହାର କରି ଜଟିଳ ସମସ୍ୟା ସମାଧାନ କରନ୍ତି । (Applies higher-order thinking to solve complex problems.)' },
  { code: 'CG-10-2', class: 10, subject: 'General', description: 'ବିଷୟ ସମୂହର ଅନ୍ତର୍ଦୃଷ୍ଟି ଓ ସମ୍ବନ୍ଧ ବୁଝନ୍ତି । (Develops interdisciplinary understanding and integrates concepts across subjects.)' },
  { code: 'CG-10-3', class: 10, subject: 'General', description: 'ସ୍ୱାଧୀନ ଓ ଦଳଗତ ଭାବେ ଗବେଷଣା କରନ୍ତି । (Engages in independent and collaborative research.)' },
  { code: 'CG-10-4', class: 10, subject: 'General', description: 'ସ୍ପଷ୍ଟ ଓ ପ୍ରଭାବଶାଳୀ ଭାବେ ଭାବନା ଓ ଯୁକ୍ତି ର ସମ୍ପ୍ରେଷଣ କରନ୍ତି । (Communicates ideas and arguments clearly.)' },
  { code: 'CG-10-5', class: 10, subject: 'General', description: 'ଭବିଷ୍ୟତର କ୍ୟାରିଅର ର ପସନ୍ଦ ସମ୍ବନ୍ଧରେ ଅବଗତ ଚୟନ କରନ୍ତି । (Makes informed choices about future careers and life paths.)' },

  // ---- Mathematics (15) ----
  { code: 'M 1001', class: 10, subject: 'Mathematics', description: 'ବାସ୍ତବ ସଂଖ୍ୟା ର ଇୟୁକ୍ଲିଡଙ୍କ ବିଭାଗ ସୂତ୍ର ଓ ମୌଳିକ ଗଣିତଶାସ୍ତ୍ର ର ମୌଳିକ ଉପପାଦ୍ୟ ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'M 1002', class: 10, subject: 'Mathematics', description: 'ବହୁପଦୀ ର ଶୂନ୍ୟସ୍ଥାନ ଓ ସେମାନଙ୍କ ସ୍ଥାନ ଓ ସମ୍ବନ୍ଧ ବୁଝନ୍ତି ।' },
  { code: 'M 1003', class: 10, subject: 'Mathematics', description: 'ଦୁଇ ଚଳରେ ଯୁଗ୍ମ ସରଳ ସମୀକରଣ ର ସମାଧାନ – ବିକଳ୍ପ, ଲୋପ ଓ ବର୍ଗ ବର୍ଗନ ପଦ୍ଧତି ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'M 1004', class: 10, subject: 'Mathematics', description: 'ବର୍ଗ ସମୀକରଣ (Quadratic Equation) ର ସମାଧାନ ସୂତ୍ର ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'M 1005', class: 10, subject: 'Mathematics', description: 'ଅନୁକ୍ରମ — ଅଙ୍କ ଅନୁକ୍ରମ (AP) ର nth ପଦ ଓ ଯୋଗଫଳ ସ୍ଥିର କରନ୍ତି ।' },
  { code: 'M 1006', class: 10, subject: 'Mathematics', description: 'ତ୍ରିଭୁଜ ର ସମରୂପତା (Similarity) ସମ୍ବନ୍ଧୀୟ ପ୍ରମେୟ ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'M 1007', class: 10, subject: 'Mathematics', description: 'ସ୍ଥାନାଙ୍କ ଜ୍ୟାମିତି ବ୍ୟବହାର କରି ଦୁଇ ବିନ୍ଦୁ ମଧ୍ୟରେ ଦୂରତା ଓ ଭାଗବିଭାଗ ବିନ୍ଦୁ ସ୍ଥିର କରନ୍ତି ।' },
  { code: 'M 1008', class: 10, subject: 'Mathematics', description: 'ତ୍ରିକୋଣମିତି (Trigonometry) ର ମୌଳିକ ଅନୁପାତ ଓ ସର୍ବସମିକା ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'M 1009', class: 10, subject: 'Mathematics', description: 'ଉଚ୍ଚତା ଓ ଦୂରତା (Heights and Distances) ସମ୍ବନ୍ଧୀୟ ସମସ୍ୟା ସମାଧାନ କରନ୍ତି ।' },
  { code: 'M 1010', class: 10, subject: 'Mathematics', description: 'ବୃତ୍ତ ର ସ୍ପର୍ଶକ ସମ୍ବନ୍ଧୀୟ ପ୍ରମେୟ ପ୍ରମାଣ କରନ୍ତି ।' },
  { code: 'M 1011', class: 10, subject: 'Mathematics', description: 'ବୃତ୍ତ ସମ୍ବନ୍ଧୀୟ କ୍ଷେତ୍ରଫଳ — ଖଣ୍ଡ, କ୍ଷେତ୍ର, ବୃତ୍ତଖଣ୍ଡ ର କ୍ଷେତ୍ରଫଳ ସ୍ଥିର କରନ୍ତି ।' },
  { code: 'M 1012', class: 10, subject: 'Mathematics', description: 'ଘନ ଆକୃତି ର ସମ୍ମିଶ୍ରଣ ର ଆୟତନ ଓ ପୃଷ୍ଠଫଳ ସ୍ଥିର କରନ୍ତି ।' },
  { code: 'M 1013', class: 10, subject: 'Mathematics', description: 'ତଥ୍ୟ ର ମାଧ୍ୟ, ମଧ୍ୟମା ଓ ବହୁଳକ (Mean, Median, Mode) ସ୍ଥିର କରନ୍ତି ।' },
  { code: 'M 1014', class: 10, subject: 'Mathematics', description: 'ସମ୍ଭାବନା (Probability) ର ତତ୍ତ୍ୱ ବ୍ୟବହାର କରି ସମସ୍ୟା ସମାଧାନ କରନ୍ତି ।' },
  { code: 'M 1015', class: 10, subject: 'Mathematics', description: 'ଗଣିତ ର ବାସ୍ତବ ଜୀବନ ପ୍ରୟୋଗ ର ସମସ୍ୟା ସୃଷ୍ଟି ଓ ସମାଧାନ କରନ୍ତି ।' },

  // ---- Science (15) ----
  { code: 'SCI 1001', class: 10, subject: 'Science', description: 'ରାସାୟନିକ ପ୍ରତିକ୍ରିୟା ଓ ସମୀକରଣ (Chemical reactions and equations) ର ସନ୍ତୁଳନ କରନ୍ତି ।' },
  { code: 'SCI 1002', class: 10, subject: 'Science', description: 'ଅମ୍ଳ, କ୍ଷାର ଓ ଲୁଣ ର ଗୁଣ ଓ pH ର ଗୁରୁତ୍ୱ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SCI 1003', class: 10, subject: 'Science', description: 'ଧାତୁ ଓ ଅଧାତୁ ର ଗୁଣ, ପ୍ରତିକ୍ରିୟା ଓ ବ୍ୟବହାର ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 1004', class: 10, subject: 'Science', description: 'କାର୍ବନ ଯୌଗିକ — ଆଲକେନ, ଆଲକୀନ, ଆଲକାଇନ ର ସଂରଚନା ଓ ବ୍ୟବହାର ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 1005', class: 10, subject: 'Science', description: 'ତତ୍ତ୍ୱ ର ପର୍ଯ୍ୟାୟ ସାରଣୀ ର ସଂଗଠନ ଓ ଗୁଣ ର ପ୍ରବର୍ତ୍ତନ ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 1006', class: 10, subject: 'Science', description: 'ଜୀବନ ଧାରଣ ର ବିଭିନ୍ନ କ୍ରିୟା — ପୋଷଣ, ଶ୍ୱାସୋଚ୍ଛ୍ୱାସ, ପରିବହନ, ବିସର୍ଜନ ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 1007', class: 10, subject: 'Science', description: 'ସଜୀବ ର ନିୟନ୍ତ୍ରଣ ଓ ସମନ୍ୱୟ — ସ୍ନାୟୁ ଓ ହରମୋନ ର ଭୂମିକା ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 1008', class: 10, subject: 'Science', description: 'ସଜୀବ ର ପ୍ରଜନନ ର ବିଭିନ୍ନ ପଦ୍ଧତି ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 1009', class: 10, subject: 'Science', description: 'ବଂଶଗତି ଓ ଜୈବିକ ବିବର୍ତ୍ତନ (heredity and evolution) ର ତତ୍ତ୍ୱ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SCI 1010', class: 10, subject: 'Science', description: 'ଆଲୋକ ର ପ୍ରତିଫଳନ ଓ ଅପବର୍ତ୍ତନ ର ସୂତ୍ର ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'SCI 1011', class: 10, subject: 'Science', description: 'ମାନବ ଆଖି ଓ ବର୍ଣ୍ଣିଳ ଦୁନିଆ — ଆଖିର ଶକ୍ତି ଓ ତ୍ରୁଟି ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SCI 1012', class: 10, subject: 'Science', description: 'ବିଦ୍ୟୁତ୍ — ଓମଙ୍କ ସୂତ୍ର, ପ୍ରତିରୋଧ ଓ ବର୍ତନୀ ର ସମସ୍ୟା ସମାଧାନ କରନ୍ତି ।' },
  { code: 'SCI 1013', class: 10, subject: 'Science', description: 'ବିଦ୍ୟୁତ୍ ର ଚୁମ୍ବକୀୟ ପ୍ରଭାବ ଓ ତାହାର ବ୍ୟବହାର ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SCI 1014', class: 10, subject: 'Science', description: 'ଶକ୍ତିର ଉତ୍ସ — ନବୀକରଣୀୟ ଓ ଅନବୀକରଣୀୟ ର ତୁଳନା କରନ୍ତି ।' },
  { code: 'SCI 1015', class: 10, subject: 'Science', description: 'ପରିବେଶ ସମସ୍ୟା — ଆମର ପରିବେଶ ଓ ସମ୍ବଳ ର ସଂରକ୍ଷଣ ର ଉପାୟ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },

  // ---- Social Science (15) ----
  { code: 'SS 1001', class: 10, subject: 'Social Science', description: 'ୟୁରୋପରେ ଜାତୀୟତାବାଦ ର ଉତ୍ଥାନ ଓ ବିକାଶ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SS 1002', class: 10, subject: 'Social Science', description: 'ଭାରତରେ ଜାତୀୟତାବାଦ ଓ ସ୍ୱାଧୀନତା ସଂଗ୍ରାମ ର ବିଭିନ୍ନ ସ୍ତର ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 1003', class: 10, subject: 'Social Science', description: 'ବିଶ୍ୱୀକରଣ ଓ ଅର୍ଥବ୍ୟବସ୍ଥା ର ସମ୍ବନ୍ଧ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SS 1004', class: 10, subject: 'Social Science', description: 'ଶିଳ୍ପକ୍ରାନ୍ତି (industrialisation) ର କାରଣ ଓ ପ୍ରଭାବ ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 1005', class: 10, subject: 'Social Science', description: 'ସମ୍ବଳ ଓ ବିକାଶ (resources and development) ର ସମ୍ବନ୍ଧ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SS 1006', class: 10, subject: 'Social Science', description: 'କୃଷି, ଖଣିଜ ସମ୍ବଳ ଓ ଶକ୍ତି ସମ୍ବଳ ର ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 1007', class: 10, subject: 'Social Science', description: 'ଉତ୍ପାଦନ ଶିଳ୍ପ ଓ ଜୀବନଯାତ୍ରା ର ସମ୍ବନ୍ଧ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SS 1008', class: 10, subject: 'Social Science', description: 'ସମ୍ବନ୍ଧ ର ସମନ୍ୱୟ ଓ ସରକାରୀ ତନ୍ତ୍ର ର ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 1009', class: 10, subject: 'Social Science', description: 'ସଂଘୀୟ ତନ୍ତ୍ର ର କାର୍ଯ୍ୟ ଓ ସ୍ଥାନୀୟ ସ୍ୱାୟତ୍ତ ସରକାର ର ଭୂମିକା ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 1010', class: 10, subject: 'Social Science', description: 'ଜାତି, ଧର୍ମ, ଲିଙ୍ଗ ଓ ଗଣତନ୍ତ୍ର ସମ୍ବନ୍ଧୀୟ ବିଷୟ ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SS 1011', class: 10, subject: 'Social Science', description: 'ଜନ ଆନ୍ଦୋଳନ ଓ ରାଜନୈତିକ ଦଳ ର ଭୂମିକା ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 1012', class: 10, subject: 'Social Science', description: 'ବିକାଶ ର ବିଭିନ୍ନ ସୂଚକ ର ତୁଳନା ଓ ବିଶ୍ଳେଷଣ କରନ୍ତି ।' },
  { code: 'SS 1013', class: 10, subject: 'Social Science', description: 'ଭାରତୀୟ ଅର୍ଥବ୍ୟବସ୍ଥା ର କ୍ଷେତ୍ର — ପ୍ରାଥମିକ, ଦ୍ୱିତୀୟକ, ତୃତୀୟକ ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'SS 1014', class: 10, subject: 'Social Science', description: 'ମୁଦ୍ରା ଓ ଋଣ ର ଭୂମିକା ବ୍ୟାଖ୍ୟା କରନ୍ତି ।' },
  { code: 'SS 1015', class: 10, subject: 'Social Science', description: 'ଗ୍ରାହକ ସତର୍କତା ଓ ଅଧିକାର ର ବର୍ଣ୍ଣନା କରନ୍ତି ।' },

  // ---- English (10) ----
  { code: 'EN 1001', class: 10, subject: 'English', description: 'Reads and critically appreciates literary texts — prose, poetry, drama.' },
  { code: 'EN 1002', class: 10, subject: 'English', description: 'Identifies themes, characters, settings and narrative techniques.' },
  { code: 'EN 1003', class: 10, subject: 'English', description: 'Writes essays, articles, formal & informal letters, applications, reports.' },
  { code: 'EN 1004', class: 10, subject: 'English', description: 'Demonstrates accurate grammar use — tenses, modals, voice, narration, clauses.' },
  { code: 'EN 1005', class: 10, subject: 'English', description: 'Reads unseen passages and answers comprehension and inference questions.' },
  { code: 'EN 1006', class: 10, subject: 'English', description: 'Listens to lectures, conversations and identifies main points.' },
  { code: 'EN 1007', class: 10, subject: 'English', description: 'Engages in dialogues, role-play and group discussions confidently.' },
  { code: 'EN 1008', class: 10, subject: 'English', description: 'Drafts notices, dialogues, speeches and analytical paragraphs.' },
  { code: 'EN 1009', class: 10, subject: 'English', description: 'Reflects on values & themes in literature (e.g., perseverance, integrity).' },
  { code: 'EN 1010', class: 10, subject: 'English', description: 'Uses dictionary, thesaurus and reference materials effectively.' },

  // ---- Odia (10) ----
  { code: 'OD 1001', class: 10, subject: 'Odia', description: 'ଓଡ଼ିଆ ସାହିତ୍ୟର ବିଶିଷ୍ଟ ସାହିତ୍ୟିକ ଓ ସେମାନଙ୍କ ରଚନା ର ବର୍ଣ୍ଣନା କରନ୍ତି ।' },
  { code: 'OD 1002', class: 10, subject: 'Odia', description: 'କବିତା ର ବ୍ୟାଖ୍ୟା ଓ କବି ର ଭାବ ବିଶ୍ଳେଷଣ କରନ୍ତି ।' },
  { code: 'OD 1003', class: 10, subject: 'Odia', description: 'ଗଦ୍ୟ — କାହାଣୀ, ପ୍ରବନ୍ଧ, ଯାତ୍ରା ବର୍ଣ୍ଣନା ର ବିଷୟ ବିଶ୍ଳେଷଣ କରନ୍ତି ।' },
  { code: 'OD 1004', class: 10, subject: 'Odia', description: 'ବ୍ୟାକରଣ — ସମାସ, ସନ୍ଧି, କାରକ, ବିଭକ୍ତି, ବାଚ୍ୟ ର ସଠିକ ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'OD 1005', class: 10, subject: 'Odia', description: 'ପ୍ରବନ୍ଧ, ପତ୍ର, ଅନୁଚ୍ଛେଦ, ବର୍ଣ୍ଣନା ର ଲେଖନ କରନ୍ତି ।' },
  { code: 'OD 1006', class: 10, subject: 'Odia', description: 'ବାକ୍ୟ ର ରୂପାନ୍ତର ଓ ସଂଯୋଗ ର ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'OD 1007', class: 10, subject: 'Odia', description: 'ଶବ୍ଦ ସମ୍ପଦ — ସମାନାର୍ଥକ, ବିପରୀତାର୍ଥକ, ଲୋକୋକ୍ତି, ପ୍ରବାଦ ବ୍ୟବହାର କରନ୍ତି ।' },
  { code: 'OD 1008', class: 10, subject: 'Odia', description: 'ଓଡ଼ିଆ ସାହିତ୍ୟର ଆଧୁନିକ ଯୁଗ ର ବିଶିଷ୍ଟ ସାହିତ୍ୟିକ ଚିହ୍ନଟ କରନ୍ତି ।' },
  { code: 'OD 1009', class: 10, subject: 'Odia', description: 'ସୃଜନଶୀଳ ଲେଖନ — ଗଳ୍ପ, କବିତା, ନାଟକ ସୃଷ୍ଟି କରନ୍ତି ।' },
  { code: 'OD 1010', class: 10, subject: 'Odia', description: 'ସମ୍ଭାଷଣ, ବକ୍ତୃତା ଓ ବାଦ-ବିବାଦ ର ସ୍ପଷ୍ଟ ଓ ଯୁକ୍ତିଯୁକ୍ତ ସମ୍ପ୍ରେଷଣ କରନ୍ତି ।' },
]

const CLASS_9_10_LO_CODES = [...CLASS_9_CODES, ...CLASS_10_CODES]

export { CLASS_9_CODES, CLASS_10_CODES, CLASS_9_10_LO_CODES }
