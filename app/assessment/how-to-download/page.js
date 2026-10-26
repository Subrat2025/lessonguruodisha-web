'use client'
import { useRouter } from 'next/navigation'

const STEPS = [
  { n: '1', icon: '🔑', t: 'ଲଗଇନ୍', d: 'ମୋବାଇଲ୍ ନମ୍ବର ଓ ପାସୱାର୍ଡ ଦେଇ ଲଗଇନ୍ କରନ୍ତୁ।' },
  { n: '2', icon: '🧑‍🏫', t: 'ଶିକ୍ଷକ ଯାଞ୍ଚ', d: 'Name, School, District, Block, UDISE ଓ Mobile ଦେଇ ଯାଞ୍ଚ ଫର୍ମ ପୂରଣ କରନ୍ତୁ ।' },
  { n: '3', icon: '🛒', t: 'କିଣନ୍ତୁ', d: 'ପ୍ୟାକ୍ ବାଛି Razorpay / UPI ରେ ସୁରକ୍ଷିତ ଭାବେ ଦେୟ ଦିଅନ୍ତୁ।' },
  { n: '4', icon: '📚', t: 'ମୋ କିଣାକିଣି', d: '"ମୋ କିଣାକିଣି" ପୃଷ୍ଠାରେ ଆପଣଙ୍କ ସମସ୍ତ ଦଲିଲ ଦେଖନ୍ତୁ।' },
  { n: '5', icon: '🔒', t: 'ଗୋପନୀୟତା ଶପଥ', d: 'ଡାଉନଲୋଡ୍ ପୂର୍ବରୁ ଗୋପନୀୟତା ଶପଥ ଗ୍ରହଣ କରନ୍ତୁ।' },
  { n: '6', icon: '⬇️', t: 'ଦେଖନ୍ତୁ / ଡାଉନଲୋଡ୍', d: 'ଅନଲାଇନ୍ ଦେଖନ୍ତୁ କିମ୍ବା ୱାଟରମାର୍କ PDF ଡାଉନଲୋଡ୍ କରନ୍ତୁ।' },
  { n: '7', icon: '🖨️', t: 'A4 ରେ ଛାପନ୍ତୁ', d: 'A4 କାଗଜରେ ପ୍ରିଣ୍ଟ କରି କ୍ଲାସରେ ବ୍ୟବହାର କରନ୍ତୁ।' },
]
const FAQ = [
  { q: 'ଡାଉନଲୋଡ୍ ହେଉନାହିଁ?', a: 'ଇଣ୍ଟରନେଟ୍ ଯାଞ୍ଚ କରନ୍ତୁ, ଥରେ ପେଜ୍ ରିଫ୍ରେସ୍ କରନ୍ତୁ। ତଥାପି ନ ହେଲେ WhatsApp କରନ୍ତୁ।' },
  { q: 'ଦିନକୁ କେତେ ଥର?', a: 'ପ୍ରତି ଦଲିଲ ଦିନକୁ ୨ ଥର। ଅନଲାଇନ୍ ଦେଖିବା ଅସୀମିତ। ଗଣନା ପ୍ରତି ରାତି ୧୨:୦୦ AM (IST) ରେ ପୁଣି ଆରମ୍ଭ ହୁଏ।' },
  { q: 'ପ୍ରଶ୍ନପତ୍ର କେବେ ଖୋଲିବ?', a: 'ପ୍ରତ୍ୟେକ ପ୍ରଶ୍ନପତ୍ର ପାଇଁ ଏକ ନିର୍ଦ୍ଦିଷ୍ଟ ତାରିଖ ଥାଏ — କାର୍ଡରେ "ଉପଲବ୍ଧ ହେବ" ଦେଖାଯିବ ଓ ସମୟ ପୂର୍ଣ୍ଣ ହେଲେ ସ୍ୱୟଂ ଖୋଲିବ।' },
  { q: 'ଯାଞ୍ଚ କେତେ ସମୟ?', a: 'ଶିକ୍ଷକ ଯାଞ୍ଚ ସାଧାରଣତଃ କିଛି ଘଣ୍ଟା ମଧ୍ୟରେ ସମ୍ପୂର୍ଣ୍ଣ ହୁଏ।' },
]

export default function HowToDownload() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white pb-12">
      <div className="bg-gradient-to-r from-indigo-700 to-violet-700 text-white px-4 pt-6 pb-8 text-center">
        <button onClick={() => router.push('/assessment')} className="text-[12px] opacity-90 mb-2">← ଷ୍ଟୋର୍‌କୁ ଫେରନ୍ତୁ</button>
        <h1 className="text-xl font-black">କିପରି ଡାଉନଲୋଡ୍ କରିବେ?</h1>
        <p className="text-[12px] opacity-90 mt-1">୭ଟି ସହଜ ଧାପରେ ଆପଣଙ୍କ ମୂଲ୍ୟାୟନ ସାମଗ୍ରୀ</p>
      </div>

      <div className="max-w-md mx-auto px-4 -mt-4 space-y-3">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-start gap-3 bg-white rounded-2xl shadow-sm border p-3.5">
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center text-2xl">{s.icon}</div>
            <div className="min-w-0">
              <p className="font-black text-[14px] text-indigo-900">Step {s.n} · {s.t}</p>
              <p className="text-[12px] text-slate-600 leading-snug">{s.d}</p>
            </div>
          </div>
        ))}

        <button onClick={() => router.push('/assessment/my')} className="w-full rounded-2xl bg-green-600 text-white font-black py-3 shadow mt-2">📚 ମୋ କିଣାକିଣି ଖୋଲନ୍ତୁ</button>

        <div className="bg-white rounded-2xl border p-4 mt-4">
          <p className="font-black text-indigo-900 text-[14px] mb-2">❓ ସାଧାରଣ ପ୍ରଶ୍ନ</p>
          <div className="space-y-2.5">
            {FAQ.map((x, i) => (
              <div key={i}>
                <p className="font-bold text-[12.5px]">{x.q}</p>
                <p className="text-[12px] text-slate-600 leading-snug">{x.a}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 text-center text-[12px]">
            <a href="https://wa.me/918093414633" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-[#25D366] text-white font-bold rounded-full px-4 py-2">💬 WhatsApp: +91 80934 14633</a>
          </div>
        </div>
      </div>
    </div>
  )
}
