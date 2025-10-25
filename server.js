// server.js
// viwaco-boatd – Enkel Node/Express-app m/ Postgres på Heroku
// Kjør lokalt: `npm install` → `npm start`
// Heroku: Koble til GitHub og Deploy. Legg til Heroku Postgres (Hobby Dev) via Dashboard.

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
require('dotenv').config();

const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'bytt-meg';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ===============================
// Postgres: kobling + init
// ===============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Heroku Postgres krever SSL; lokalt kan DATABASE_URL mangle – da bruker pg uten SSL
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seed med to eksempelannonser hvis tomt
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM listings');
  if (rows[0].n === 0) {
    await pool.query(
      `INSERT INTO listings (title, price_nok, location, description, phone)
       VALUES 
       ($1,$2,$3,$4,$5),
       ($6,$7,$8,$9,$10)`,
      [
        'Uttern 4602 (2004)', 45000, 'Oslo', 'Velholdt skjærgårdsjeep. 40hk Mercury, nylig servet.', '+47 900 00 000',
        'Askeladden 475 Freestyle (2011)', 125000, 'Bergen', 'Klar for sommeren. Garmin kartplotter, kalesje.', '+47 901 23 456'
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
</head>
<body class="bg-slate-50 text-slate-900">
  <header class="bg-white/80 backdrop-blur sticky top-0 z-10 border-b">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="text-xl font-bold">viwaco-boatd</a>
      <nav class="flex gap-6 text-sm">
        <a class="hover:underline" href="#kjop">Kjøp båt</a>
        <a class="hover:underline" href="#selg">Selg båt</a>
        <a class="hover:underline" href="#rep">Reparasjon</a>
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

app.get('/', async (req, res) => {
  try {
    const { rows: listings } = await pool.query('SELECT * FROM listings ORDER BY created_at DESC, id DESC');
    const cards = listings.map(l => `
      <div class="rounded-2xl border bg-white shadow-sm p-4 flex flex-col">
        <h3 class="text-lg font-semibold">${l.title}</h3>
        <p class="text-sm text-slate-600">${l.location}</p>
        <p class="mt-2 font-bold">${currency(l.price_nok)}</p>
        <p class="mt-2 text-sm">${l.description}</p>
        <a href="tel:${l.phone}" class="mt-4 inline-flex items-center justify-center rounded-xl border px-4 py-2 hover:bg-slate-50">Ring selger</a>
      </div>
    `).join('');

    const html = layout('viwaco-boatd – kjøp, salg og reparasjon', `
      <section id="hero" class="grid sm:grid-cols-2 gap-8 items-center">
        <div>
          <h1 class="text-3xl sm:text-4xl font-bold leading-tight">Kjøp, salg og reparasjon av båter – enkelt og trygt</h1>
          <p class="mt-4 text-slate-700">Vi hjelper deg med å finne riktig båt, selge trygt og få verkstedshjelp når du trenger det.</p>
          <div class="mt-6 flex gap-3">
            <a href="#kjop" class="rounded-xl bg-slate-900 text-white px-5 py-3">Se båter til salgs</a>
            <a href="#rep" class="rounded-xl border px-5 py-3">Bestill reparasjon</a>
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

      <section id="kjop" class="mt-14">
        <div class="flex items-end justify-between">
          <h2 class="text-2xl font-bold">Båter til salgs</h2>
          <a href="/listings.json" class="text-sm underline">Last ned JSON</a>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">${cards || '<p>Ingen annonser enda.</p>'}</div>
      </section>

      <section id="selg" class="mt-14">
        <h2 class="text-2xl font-bold">Selg båt</h2>
        <p class="text-sm text-slate-600">Fyll ut skjemaet, så publiserer vi annonsen. Krever engangsnøkkel (ADMIN_TOKEN).</p>
        <form class="mt-4 grid gap-3 max-w-xl" method="post" action="/sell">
          <input class="border rounded-xl px-4 py-2" name="title" placeholder="Tittel (merke/modell/år)" required />
          <input class="border rounded-xl px-4 py-2" type="number" name="priceNOK" placeholder="Pris (NOK)" required />
          <input class="border rounded-xl px-4 py-2" name="location" placeholder="Sted" required />
          <input class="border rounded-xl px-4 py-2" name="phone" placeholder="Telefon" required />
          <textarea class="border rounded-xl px-4 py-2" name="description" placeholder="Beskrivelse" rows="4" required></textarea>
          <input class="border rounded-xl px-4 py-2" name="token" placeholder="Admin token" required />
          <button class="rounded-xl bg-slate-900 text-white px-5 py-3" type="submit">Publiser</button>
        </form>
      </section>

      <section id="rep" class="mt-14">
        <h2 class="text-2xl font-bold">Bestill reparasjon / service</h2>
        <p class="text-sm text-slate-600">Vi tar kontakt innen 1 arbeidsdag.</p>
        <form class="mt-4 grid gap-3 max-w-xl" method="post" action="/repair">
          <input class="border rounded-xl px-4 py-2" name="name" placeholder="Navn" required />
          <input class="border rounded-xl px-4 py-2" name="phone" placeholder="Telefon" required />
          <input class="border rounded-xl px-4 py-2" name="boat" placeholder="Båt (merke/modell/år)" required />
          <textarea class="border rounded-xl px-4 py-2" name="issue" placeholder="Hva trenger du hjelp med?" rows="4" required></textarea>
          <button class="rounded-xl bg-slate-900 text-white px-5 py-3" type="submit">Send forespørsel</button>
        </form>
      </section>
    `);
    res.send(html);
  } catch (e) {
    console.error(e);
    res.status(500).send('Feil ved henting av forsiden.');
  }
});

// API og form-handlers
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
  const { title, priceNOK, location, description, phone, token } = req.body;
  try {
    if (token !== ADMIN_TOKEN) {
      return res.status(401).send(layout('Ugyldig token', `<div class="p-6 bg-white rounded-2xl border"><p class="text-red-600">Ugyldig admin token.</p><p class="mt-4"><a class="underline" href="/">Tilbake</a></p></div>`));
    }
    await pool.query(
      `INSERT INTO listings (title, price_nok, location, description, phone) VALUES ($1,$2,$3,$4,$5)`,
      [title, Number(priceNOK), location, description, phone]
    );
    await pool.query(
      `INSERT INTO sell_submissions (title, price_nok, location, description, phone) VALUES ($1,$2,$3,$4,$5)`,
      [title, Number(priceNOK), location, description, phone]
    );
    res.redirect('/#kjop');
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

    // Valgfritt: send e‑post via SendGrid om SENDGRID_API_KEY og TO_EMAIL er satt
    try {
      if (process.env.SENDGRID_API_KEY && process.env.TO_EMAIL) {
        const sg = require('@sendgrid/mail');
        sg.setApiKey(process.env.SENDGRID_API_KEY);
        await sg.send({
          to: process.env.TO_EMAIL,
          from: process.env.FROM_EMAIL || process.env.TO_EMAIL,
          subject: `Ny serviceforespørsel – ${name}`,
          text: `Navn: ${name}\nTelefon: ${phone}\nBåt: ${boat}\n\nProblem:\n${issue}`
        });
      }
    } catch (mailErr) {
      console.error('Klarte ikke å sende e‑post:', mailErr.message);
    }

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

// Enkel admin-side (lese data) – beskyttet med token i query (?token=...)
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

    const items = listings.map(l => `<li><strong>${l.title}</strong> – ${currency(l.price_nok)} – ${l.location}</li>`).join('');
    const repairList = repairs.map(r => `<li>#${r.id} – ${r.name} (${r.phone}) – ${r.boat}</li>`).join('');
    const sellList = sells.map(s => `<li>#${s.id} – ${s.title} – ${currency(s.price_nok)}</li>`).join('');

    res.send(layout('Admin', `
      <div class="grid lg:grid-cols-3 gap-6">
        <div class="p-6 bg-white rounded-2xl border">
          <h3 class="font-semibold">Annonser (${listings.length})</h3>
          <ul class="mt-2 list-disc ml-5 text-sm">${items || '<li>Ingen</li>'}</ul>
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
    `));
  } catch (e) {
    console.error(e);
    res.status(500).send('Klarte ikke å hente admin-data.');
  }
});

app.use((req, res) => {
  res.status(404).send(layout('404', `<div class="p-6 bg-white rounded-2xl border"><p>Siden finnes ikke.</p><p class="mt-4"><a class="underline" href="/">Til forsiden</a></p></div>`));
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
