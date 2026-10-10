require('dotenv').config();
const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.png','.jpg','.jpeg','.webp','.gif','.pdf','.txt','.md','.csv','.docx'];
    cb(allowed.includes(ext) ? null : new Error('این نوع فایل پشتیبانی نمی‌شود. تصویر، PDF، DOCX، TXT، MD و CSV بفرستید.'), allowed.includes(ext));
  }
});
function client() {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'put_your_api_key_here') throw new Error('کلید API تنظیم نشده است. فایل .env را بساز و OPENAI_API_KEY را وارد کن.');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
async function readFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)) {
    const mime = ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'})[ext];
    return { kind: 'image', name: file.originalname, data: `data:${mime};base64,${file.buffer.toString('base64')}` };
  }
  if (ext === '.pdf') { const x = await pdfParse(file.buffer); return { kind:'text', name:file.originalname, text:x.text.slice(0,50000) }; }
  if (ext === '.docx') { const x = await mammoth.extractRawText({buffer:file.buffer}); return {kind:'text',name:file.originalname,text:x.value.slice(0,50000)}; }
  return {kind:'text',name:file.originalname,text:file.buffer.toString('utf8').slice(0,50000)};
}
app.get('/api/health', (_req,res) => res.json({ok:true, configured:!!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'put_your_api_key_here')}));
app.post('/api/chat', upload.array('files',5), async (req,res) => {
  try {
    const ai = client();
    const message = (req.body.message || '').trim();
    let history=[]; try { history=JSON.parse(req.body.history || '[]'); } catch {}
    history = Array.isArray(history) ? history.slice(-12).filter(m => ['user','assistant'].includes(m.role) && typeof m.content === 'string') : [];
    const files = await Promise.all((req.files || []).map(readFile));
    if (!message && !files.length) return res.status(400).json({error:'پیام یا فایلی برای ارسال وارد کن.'});
    const content=[];
    if (message) content.push({type:'input_text',text:message});
    for (const f of files) {
      if (f.kind === 'image') { content.push({type:'input_text',text:`تصویر پیوست‌شده: ${f.name}`}); content.push({type:'input_image',image_url:f.data,detail:'auto'}); }
      else content.push({type:'input_text',text:`محتوای فایل «${f.name}»:\n${f.text || '(متن قابل استخراجی پیدا نشد.)'}`});
    }
    const result = await ai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      instructions: 'تو احسان AI هستی؛ دستیار مفید، محترمانه و دقیق. به زبان کاربر پاسخ بده و اگر فارسی می‌نویسد فارسی پاسخ بده. فایل و تصویر ارسالی را بررسی کن و اگر چیزی روشن نیست صادقانه بگو. درباره سازنده فقط در صورت نیاز بگو این پروژه توسط احسان کیانی، نوجوان علاقه‌مند به فناوری ساخته شده است؛ ادعاهای تأییدنشده نساز.',
      input:[...history.map(m=>({role:m.role,content:m.content})),{role:'user',content}], max_output_tokens:1600
    });
    res.json({reply:result.output_text || 'پاسخی دریافت نشد.'});
  } catch(err) { console.error(err); res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 500).json({error:err.message || 'خطای غیرمنتظره رخ داد.'}); }
});
app.get('*', (_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`Ehsan AI is running at http://localhost:${PORT}`));
