// Test PDF fetch from Apps Script
const fileId = '1rW7RIFAg82QK5GkKgRZkWxcjClhTzjDv';
const url = 'https://script.google.com/macros/s/AKfycbzijZQKn0h-LCwPM59JnZtgY56vlDT-28-sC8sVGYc6OEtw3GeQbk69Imoo9x8PI8L2/exec';

async function testFetch() {
  try {
    console.log('Fetching PDF...');
    const start = Date.now();
    const r = await fetch(`${url}?action=file&fileId=${encodeURIComponent(fileId)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(90000),
      redirect: 'follow',
    });
    const elapsed = Date.now() - start;
    console.log('Status:', r.status);
    console.log('Elapsed:', elapsed, 'ms');
    
    if (!r.ok) {
      console.log('Error: HTTP', r.status);
      return;
    }
    
    const j = await r.json();
    console.log('Response keys:', Object.keys(j));
    console.log('ok:', j.ok);
    console.log('Has base64:', !!j.base64);
    console.log('Base64 length:', j.base64 ? j.base64.length : 0);
  } catch (e) {
    console.log('Exception:', e.message);
    console.log('Stack:', e.stack);
  }
}

testFetch();
