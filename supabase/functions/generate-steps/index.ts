// Supabase Edge Function: menyusun langkah flowchart dari narasi proses dengan Claude API.
// Opsional. Aktifkan dengan:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...      (wajib)
//   supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5-5 (opsional)
//   supabase functions deploy generate-steps --no-verify-jwt   (login pengguna diperiksa di bawah)
// lalu set VITE_ENABLE_AI=true di hosting frontend.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PROMPT = (narrative: string) => `Anda membantu process owner menyusun flowchart SOP perusahaan. Ubah narasi proses di bawah menjadi langkah-langkah flowchart lintas fungsi (swimlane).
Balas HANYA dengan JSON berbentuk:
{"title": "judul proses singkat", "steps": [{"n": 1, "text": "...", "lane": "...", "type": "start|process|decision|document|end", "next": null, "yes": null, "no": null, "output": "", "time": ""}]}
Aturan:
- Langkah 1 bertipe "start" dengan text "Mulai"; langkah terakhir bertipe "end" dengan text "Selesai". Boleh ada lebih dari satu "end" bila perlu.
- "lane" = jabatan atau unit pelaksana (mis. "Karyawan", "Atasan Langsung", "HR"). Gunakan nama yang konsisten.
- "text" singkat, diawali kata kerja, maksimal 12 kata. Keputusan ditulis sebagai pertanyaan diakhiri "?".
- "type" "document" untuk langkah yang menghasilkan atau mengirim dokumen/surat/email.
- Untuk "decision": isi "yes" dan "no" dengan nomor langkah tujuan (n). Untuk langkah lain isi "next" hanya bila TIDAK lanjut ke langkah n+1; selain itu null.
- "output" dan "time" diisi hanya bila disebut atau jelas dari narasi.
- Gunakan Bahasa Indonesia baku. Jangan menambah aktivitas yang tidak ada di narasi.

Narasi:
"""${narrative}"""`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Fitur AI belum dikonfigurasi oleh admin.' }, 501);

  // Hanya pengguna yang sudah masuk (bukan sekadar pemegang anon key).
  // Project lama memakai SUPABASE_ANON_KEY; project baru juga menyediakan SUPABASE_PUBLISHABLE_KEYS.
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default;
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, publicKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Silakan masuk terlebih dahulu.' }, 401);

  let narrative = '';
  try { narrative = String((await req.json())?.narrative ?? '').trim(); } catch { /* body tidak valid */ }
  if (narrative.length < 20) return json({ error: 'Narasi terlalu pendek. Ceritakan prosesnya minimal satu-dua kalimat.' }, 400);
  if (narrative.length > 8000) narrative = narrative.slice(0, 8000);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: PROMPT(narrative) }],
    }),
  });
  if (!res.ok) {
    console.error('Anthropic API', res.status, await res.text());
    return json({ error: res.status === 429 ? 'Layanan AI sedang sibuk. Coba lagi sebentar lagi.' : 'Layanan AI gagal merespons. Coba lagi.' }, 502);
  }
  const data = await res.json();
  const text: string = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed?.steps) || !parsed.steps.length) throw new Error('kosong');
    return json(parsed);
  } catch {
    return json({ error: 'Hasil AI tidak bisa dibaca. Coba perjelas narasinya lalu susun ulang.' }, 422);
  }
});
