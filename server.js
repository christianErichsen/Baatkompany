// server.js
// viwaco-boatd – Express + Postgres (Heroku) med egne sider, bildeopplasting (Cloudinary) og enkle nyheter
// Merk: For bilder bruker vi Cloudinary Upload Widget (klient-side, unsigned preset)
// Du må sette disse i Heroku → Settings → Config Vars:
// - ADMIN_TOKEN = hemmelig streng
// - DATABASE_URL = (kommer fra Heroku Postgres)
// - CLOUDINARY_CLOUD_NAME = f.eks. dixxxxxxx
// - CLOUDINARY_UPLOAD_PRESET = unsigned preset-navn du lager i Cloudinary

const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'bytt-meg';
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || '';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ===============================
// Postgres: kobling + init
// ===============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS listings (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      price_nok INTEGER NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      phone TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS repair_requests (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      boat TEXT NOT NULL,
      issue TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sell_submissions (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      price_nok INTEGER NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      phone TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS news_posts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Sikre kolonnen finnes ved senere deploys
  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS image_url TEXT;`);
  await pool.query(`ALTER TABLE sell_submissions ADD COLUMN IF NOT EXISTS image_url TEXT;`);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM listings');
  if (rows[0].n === 0) {
    await pool.query(
      `INSERT INTO listings (title, price_nok, location, description, phone, image_url)
       VALUES 
       ($1,$2,$3,$4,$5,$6),
       ($7,$8,$9,$10,$11,$12)`,
      [
        'Uttern 4602 (2004)', 45000, 'Oslo', 'Velholdt skjærgårdsjeep. 40hk Mercury, nylig servet.', '+47 900 00 000', null,
        'Askeladden 475 Freestyle (2011)', 125000, 'Bergen', 'Klar for sommeren. Garmin kartplotter, kalesje.', '+47 901 23 456', null
      ]
    );
  }
}

function layout(title, content) {
  return `<!doctype html>
<html lang="no">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>body{font-family:Inter,ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial}</style>
</head>
<body class="bg-slate-50 text-slate-900">
  <header class="bg-white/70 backdrop-blur sticky top-0 z-10 border-b">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="text-xl font-bold tracking-tight">viwaco-boatd</a>
      <nav class="flex gap-6 text-sm">
        <a class="hover:underline" href="/">Hjem</a>
        <a class="hover:underline" href="/sell">Selg båt</a>
        <a class="hover:underline" href="/repair">Bestill reparasjon</a>
        <a class="hover:underline" href="/news">Nyheter</a>
      </nav>
    </div>
  </header>
  <main class="max-w-6xl mx-auto px-4 py-10">
    ${content}
  </main>
  <footer class="border-t mt-12">
    <div class="max-w-6xl mx-auto px-4 py-6 text-sm flex flex-col sm:flex-row items-center justify-between gap-4">
      <p>© ${new Date().getFullYear()} viwaco-boatd</p>
      <p><a class="underline" href="/admin">Admin</a></p>
    </div>
  </footer>
  <script src="https://widget.cloudinary.com/v2.0/global/all.js" defer></script>
</body>
</html>`;
}

function currency(nok) {
  try {
    return new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(nok);
  } catch {
    return `${nok} NOK`;
  }
}

// ===============================
// Sider
// ===============================
app.get('/', async (req, res) => {
  try {
    const { rows: listings } = await pool.query('SELECT * FROM listings ORDER BY created_at DESC, id DESC');
    const cards = listings.map(l => `
      <div class="rounded-2xl border bg-white shadow-sm p-4 flex flex-col">
        ${l.image_url ? `<img src="${l.image_url}" alt="${l.title}" class="rounded-xl w-full h-44 object-cover mb-3">` : ''}
        <h3 class="text-lg font-semibold line-clamp-1">${l.title}</h3>
        <p class="text-sm text-slate-600">${l.location}</p>
        <p class="mt-2 font-bold">${currency(l.price_nok)}</p>
        <p class="mt-2 text-sm line-clamp-3">${l.description}</p>
        <a href="tel:${l.phone}" class="mt-4 inline-flex items-center justify-center rounded-xl border px-4 py-2 hover:bg-slate-50">Ring selger</a>
      </div>
    `).join('');

    const html = layout('viwaco-boatd – Hjem', `
      <section class="grid sm:grid-cols-2 gap-8 items-center">
        <div>
          <h1 class="text-3xl sm:text-4xl font-bold leading-tight">Kjøp, salg og reparasjon av båter – enkelt og trygt</h1>
          <p class="mt-4 text-slate-700">Vi hjelper deg med å finne riktig båt, selge trygt og få verkstedshjelp når du trenger det.</p>
          <div class="mt-6 flex gap-3">
            <a href="/sell" class="rounded-xl bg-slate-900 text-white px-5 py-3">Selg båt</a>
            <a href="/repair" class="rounded-xl border px-5 py-3">Bestill reparasjon</a>
          </div>
        </div>
        <div class="rounded-2xl bg-white border shadow-sm p-6">
          <h2 class="font-semibold">Åpningstider</h2>
          <ul class="mt-2 text-sm list-disc ml-5">
            <li>Hverdager: 09–17</li>
            <li>Lørdag: 10–14</li>
            <li>Søndag: Stengt</li>
          </ul>
          <p class="mt-4 text-sm">Telefon: <a class="underline" href="tel:+4790000000">+47 900 00 000</a></p>
          <p class="text-sm">E‑post: <a class="underline" href="mailto:post@viwaco-boatd.com">post@viwaco-boatd.com</a></p>
        </div>
      </section>

      <section class="mt-14">
        <div class="flex items-end justify-between">
          <h2 class="text-2xl font-bold">Båter til salgs</h2>
          <a href="/listings.json" class="text-sm underline">Last ned JSON</a>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">${cards || '<p>Ingen annonser enda.</p>'}</div>
      </section>
    `);
    res.send(html);
  } catch (e) {
    console.error(e);
    res.status(500).send('Feil ved henting av forsiden.');
  }
});

app.get('/sell', (req, res) => {
  const html = layout('viwaco-boatd – Selg båt', `
    <h1 class="text-2xl font-bold">Selg båt</h1>
    <p class="text-sm text-slate-600">Fyll ut skjemaet. Krever admin token.</p>
    <form class="mt-4 grid gap-3 max-w-xl" method="post" action="/sell">
      <input class="border rounded-xl px-4 py-2" name="title" placeholder="Tittel (merke/modell/år)" required />
      <input class="border rounded-xl px-4 py-2" type="number" name="priceNOK" placeholder="Pris (NOK)" required />
      <input class="border rounded-xl px-4 py-2" name="location" placeholder="Sted" required />
      <input class="border rounded-xl px-4 py-2" name="phone" placeholder="Telefon" required />
      <textarea class="border rounded-xl px-4 py-2" name="description" placeholder="Beskrivelse" rows="4" required></textarea>

      <div class="p-4 border rounded-xl bg-white">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">Bilder</p>
            <p class="text-xs text-slate-500">Valgfritt – last opp ett bilde</p>
          </div>
          <button type="button" id="uploadBtn" class="rounded-lg border px-3 py-2 text-sm">Last opp</button>
        </div>
        <input type="hidden" name="image_url" id="image_url" />
        <img id="preview" class="mt-3 rounded-xl hidden w-full h-48 object-cover" alt="Forhåndsvisning" />
      </div>

      <input class="border rounded-xl px-4 py-2" name="token" placeholder="Admin token" required />
      <button class="rounded-xl bg-slate-900 text-white px-5 py-3" type="submit">Publiser</button>
    </form>

    <script>
      document.addEventListener('DOMContentLoaded', function(){
        const btn = document.getElementById('uploadBtn');
        const img = document.getElementById('preview');
        const input = document.getElementById('image_url');
        btn?.addEventListener('click', function(){
          if (!('${CLOUD_NAME}') || !('${UPLOAD_PRESET}')) {
            alert('Bildeopplasting ikke konfigurert. Be administrator sette CLOUDINARY_CLOUD_NAME og CLOUDINARY_UPLOAD_PRESET.');
            return;
          }
          const widget = cloudinary.createUploadWidget({
            cloudName: '${CLOUD_NAME}',
            uploadPreset: '${UPLOAD_PRESET}',
            sources: ['local','url','camera'],
            multiple: false,
            maxFileSize: 5_000_000,
            folder: 'viwaco-boatd/listings'
          }, (error, result) => {
            if (!error && result && result.event === 'success') {
              input.value = result.info.secure_url;
              img.src = result.info.secure_url;
              img.classList.remove('hidden');
            }
          });
          widget.open();
        });
      });
    </script>
  `);
  res.send(html);
});

app.get('/repair', (req, res) => {
  const html = layout('viwaco-boatd – Bestill reparasjon', `
    <h1 class="text-2xl font-bold">Bestill reparasjon / service</h1>
    <p class="text-sm text-slate-600">Vi tar kontakt innen 1 arbeidsdag.</p>
    <form class="mt-4 grid gap-3 max-w-xl" method="post" action="/repair">
      <input class="border rounded-xl px-4 py-2" name="name" placeholder="Navn" required />
      <input class="border rounded-xl px-4 py-2" name="phone" placeholder="Telefon" required />
      <input class="border rounded-xl px-4 py-2" name="boat" placeholder="Båt (merke/modell/år)" required />
      <textarea class="border rounded-xl px-4 py-2" name="issue" placeholder="Hva trenger du hjelp med?" rows="4" required></textarea>
      <button class="rounded-xl bg-slate-900 text-white px-5 py-3" type="submit">Send forespørsel</button>
    </form>
  `);
  res.send(html);
});

app.get('/news', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM news_posts ORDER BY created_at DESC, id DESC');
  const items = rows.map(n => `
    <article class="p-5 bg-white border rounded-2xl shadow-sm">
      <h3 class="text-lg font-semibold">${n.title}</h3>
      <p class="text-xs text-slate-500">${new Date(n.created_at).toLocaleString('no-NO')}</p>
      <p class="mt-3 whitespace-pre-wrap">${n.body}</p>
    </article>
  `).join('');
  const html = layout('viwaco-boatd – Nyheter', `
    <h1 class="text-2xl font-bold">Nyheter</h1>
    <div class="mt-6 grid gap-4">${items || '<p>Ingen nyheter enda.</p>'}</div>
  `);
  res.send(html);
});

// ===============================
// API og POST-handlers
// ===============================
app.get('/listings.json', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM listings ORDER BY created_at DESC, id DESC');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Kunne ikke hente listings' });
  }
});

app.post('/sell', async (req, res) => {
  const { title, priceNOK, location, description, phone, token, image_url } = req.body;
  try {
    if (token !== ADMIN_TOKEN) {
      return res.status(401).send(layout('Ugyldig token', `<div class=\"p-6 bg-white rounded-2xl border\"><p class=\"text-red-600\">Ugyldig admin token.</p><p class=\"mt-4\"><a class=\"underline\" href=\"/sell\">Tilbake</a></p></div>`));
    }
    await pool.query(
      `INSERT INTO listings (title, price_nok, location, description, phone, image_url) VALUES ($1,$2,$3,$4,$5,$6)`,
      [title, Number(priceNOK), location, description, phone, image_url || null]
    );
    await pool.query(
      `INSERT INTO sell_submissions (title, price_nok, location, description, phone, image_url) VALUES ($1,$2,$3,$4,$5,$6)`,
      [title, Number(priceNOK), location, description, phone, image_url || null]
    );
    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.status(500).send('Klarte ikke å lagre annonsen.');
  }
});

app.post('/repair', async (req, res) => {
  const { name, phone, boat, issue } = req.body;
  try {
    await pool.query(
      `INSERT INTO repair_requests (name, phone, boat, issue) VALUES ($1,$2,$3,$4)`,
      [name, phone, boat, issue]
    );
    res.send(layout('Takk! ', `
      <div class="p-6 bg-white rounded-2xl border">
        <h2 class="text-xl font-semibold">Takk for forespørselen!</h2>
        <p class="mt-2 text-slate-700">Vi tar kontakt på telefon ${phone}.</p>
        <p class="mt-4"><a class="underline" href="/">Til forsiden</a></p>
      </div>
    `));
  } catch (e) {
    console.error(e);
    res.status(500).send('Klarte ikke å lagre service-forespørselen.');
  }
});

// Nyheter – opprette (via admin-siden nedenfor)
app.post('/news', async (req, res) => {
  const { token, title, body } = req.body;
  try {
    if (token !== ADMIN_TOKEN) return res.status(401).send('Ugyldig token');
    await pool.query('INSERT INTO news_posts (title, body) VALUES ($1,$2)', [title, body]);
    res.redirect('/admin?token=' + encodeURIComponent(token));
  } catch (e) {
    console.error(e);
    res.status(500).send('Klarte ikke å opprette nyhet.');
  }
});

// Slett annonse (token-beskyttet)
app.post('/delete-listing', async (req, res) => {
  const { id, token } = req.body;
  try {
    if (token !== ADMIN_TOKEN) return res.status(401).send('Ugyldig token');
    await pool.query('DELETE FROM listings WHERE id = $1', [Number(id)]);
    res.redirect('/admin?token=' + encodeURIComponent(token));
  } catch (e) {
    console.error(e);
    res.status(500).send('Klarte ikke å slette annonsen.');
  }
});

// Admin-side
app.get('/admin', async (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.send(layout('Admin', `
      <div class="p-6 bg-white rounded-2xl border">
        <h2 class="text-xl font-semibold">Admin</h2>
        <p class="mt-2 text-slate-700">Legg til <code>?token=DITT_TOKEN</code> i URL for tilgang.</p>
      </div>
    `));
  }
  try {
    const { rows: listings } = await pool.query('SELECT * FROM listings ORDER BY created_at DESC, id DESC');
    const { rows: repairs } = await pool.query('SELECT * FROM repair_requests ORDER BY created_at DESC, id DESC');
    const { rows: sells } = await pool.query('SELECT * FROM sell_submissions ORDER BY created_at DESC, id DESC');
    const { rows: news } = await pool.query('SELECT * FROM news_posts ORDER BY created_at DESC, id DESC');

    const items = listings.map(l => `
      <li class="flex items-center gap-3">
        <span class="flex-1"><strong>${l.title}</strong> – ${currency(l.price_nok)} – ${l.location}</span>
        <form method="post" action="/delete-listing" class="inline" onsubmit="return confirm('Slette denne annonsen?');">
          <input type="hidden" name="id" value="${l.id}" />
          <input type="hidden" name="token" value="${token}" />
          <button class="px-3 py-1 rounded-lg border text-sm hover:bg-red-50" type="submit">Slett</button>
        </form>
      </li>
    `).join('');

    const repairList = repairs.map(r => `<li>#${r.id} – ${r.name} (${r.phone}) – ${r.boat}</li>`).join('');
    const sellList = sells.map(s => `<li>#${s.id} – ${s.title} – ${currency(s.price_nok)}</li>`).join('');
    const newsList = news.map(n => `<li><strong>${n.title}</strong> – ${new Date(n.created_at).toLocaleString('no-NO')}</li>`).join('');

    res.send(layout('Admin', `
      <div class="grid lg:grid-cols-3 gap-6">
        <div class="p-6 bg-white rounded-2xl border">
          <h3 class="font-semibold">Annonser (${listings.length})</h3>
          <ul class="mt-2 space-y-2 text-sm">${items || '<li>Ingen</li>'}</ul>
        </div>
        <div class="p-6 bg-white rounded-2xl border">
          <h3 class="font-semibold">Serviceforespørsler (${repairs.length})</h3>
          <ul class="mt-2 list-disc ml-5 text-sm">${repairList || '<li>Ingen</li>'}</ul>
        </div>
        <div class="p-6 bg-white rounded-2xl border">
          <h3 class="font-semibold">Innsendte salgsdata (${sells.length})</h3>
          <ul class="mt-2 list-disc ml-5 text-sm">${sellList || '<li>Ingen</li>'}</ul>
        </div>
      </div>

      <div class="p-6 bg-white rounded-2xl border mt-6">
        <h3 class="font-semibold">Opprett nyhet</h3>
        <form method="post" action="/news" class="grid gap-3 max-w-xl mt-3">
          <input type="hidden" name="token" value="${token}" />
          <input class="border rounded-xl px-4 py-2" name="title" placeholder="Tittel" required />
          <textarea class="border rounded-xl px-4 py-2" name="body" placeholder="Innhold" rows="6" required></textarea>
          <button class="rounded-xl bg-slate-900 text-white px-5 py-3" type="submit">Publiser nyhet</button>
        </form>
        <h4 class="font-medium mt-6">Publiserte nyheter (${news.length})</h4>
        <ul class="mt-2 list-disc ml-5 text-sm">${newsList || '<li>Ingen</li>'}</ul>
      </div>
    `));
  } catch (e) {
    console.error(e);
    res.status(500).send('Klarte ikke å hente admin-data.');
  }
});

app.use((req, res) => {
  res.status(404).send(layout('404', `<div class=\"p-6 bg-white rounded-2xl border\"><p>Siden finnes ikke.</p><p class=\"mt-4\"><a class=\"underline\" href=\"/\">Til forsiden</a></p></div>`));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server lytter på http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('DB init feilet:', err);
    process.exit(1);
  });
