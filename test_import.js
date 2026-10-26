// Test dynamic import
async function testImport() {
  try {
    console.log('Importing aiLessonGenerator...');
    const { fetchChapterPdfBase64, generateLessonJson, jsonToPanchapadiHtml } = await import('./lib/aiLessonGenerator.js');
    console.log('Import successful!');
    console.log('fetchChapterPdfBase64:', typeof fetchChapterPdfBase64);
    console.log('generateLessonJson:', typeof generateLessonJson);
    console.log('jsonToPanchapadiHtml:', typeof jsonToPanchapadiHtml);
    
    // Test PDF fetch
    console.log('\nTesting PDF fetch...');
    const result = await fetchChapterPdfBase64('1rW7RIFAg82QK5GkKgRZkWxcjClhTzjDv');
    console.log('Result:', result.ok ? 'SUCCESS' : 'FAILED');
    if (!result.ok) {
      console.log('Error:', result.error);
    } else {
      console.log('Base64 length:', result.base64.length);
    }
  } catch (e) {
    console.log('Exception:', e.message);
    console.log('Stack:', e.stack);
  }
}

testImport();
