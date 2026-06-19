# Derrick L. Mayiku — Personal Portfolio

A dynamic personal portfolio showcasing skills, experience, and projects. Built with **Express.js** and vanilla frontend, featuring a data-driven architecture with a built-in **admin panel** for real-time content management.

🔗 **Live**: [derrickml.com](https://derrickml.com)

---

## ✨ Features

- **Dynamic Content** — Portfolio content, public section labels, navigation labels, imagery, projects, and contact UI copy are rendered from JSON-backed APIs
- **Admin Dashboard** — Password-protected panel at `/admin.html` to edit content, site settings, SMTP settings, images, and admin password
- **Testimonials** — Loaded from a configurable external JSON/Google Sheets API
- **Contact Form** — Server-side email delivery via configurable Nodemailer SMTP with CAPTCHA protection
- **Private Subscription Tracker** — Admin-only renewal tracking for domains, SaaS tools, hosting, and client services with configurable email reminders
- **Security Hardened** — Helmet CSP headers, rate limiting, input validation, bcrypt auth

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Server** | Node.js 18+, Express 5 |
| **Auth** | express-session, bcryptjs |
| **Security** | helmet (CSP), express-rate-limit |
| **Email** | Nodemailer |
| **Frontend** | HTML5, CSS3, JavaScript, Bootstrap 5 |
| **Data** | JSON flat files (`data/` directory) |

---

## 📁 Project Structure

```
Derrick-Portfolio/
├── server.js              # Express server, API routes, auth
├── .env                   # Credentials (gitignored)
├── package.json
├── package-lock.json      # Reproducible npm dependency tree
├── nodemon.json
│
├── data/                  # JSON data store
│   ├── profile.json       # Name, tagline, about text, details, social links
│   ├── skills.json        # Skills with percentages
│   ├── interests.json     # Interests with icons and colors
│   ├── resume.json        # Summary, experience, education, certs, honors
│   ├── contact.json       # Address, emails, phones, social links
│   ├── projects.json      # Project cards and modal details
│   ├── settings.json      # Non-secret runtime settings and images
│   ├── site.json          # Public navigation, labels, visibility, testimonials source
│   ├── subscriptions.json # Private renewal/subscription tracker data, gitignored
│   └── secrets.json       # Runtime secrets created by admin settings, gitignored
│
├── workers/               # Optional Cloudflare Worker cron scheduler
│   ├── subscription-reminder-cron.mjs
│   ├── subscription-reminder-wrangler.example.toml
│   └── README.md
│
└── public/                # Static frontend
    ├── index.html         # Main portfolio page
    ├── admin.html         # Admin dashboard
    └── assets/
        ├── css/style.css
        ├── img/
        ├── js/
        │   ├── main.js          # Core section navigation and UI logic
        │   ├── data-loader.js   # Fetches JSON data, renders sections
        │   ├── admin.js         # Admin auth, form editors, save logic
        │   ├── contact-form.js  # Contact form submission
        │   ├── projects-loader.js # Project cards, filters, modal details
        │   └── testimonials.js  # Testimonials carousel
        └── vendor/              # Bootstrap, icon fonts, Swiper, etc.
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+

### Installation

```bash
git clone https://github.com/DerrickML/Derrick-Portfolio.git
cd Derrick-Portfolio
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Email (for contact form)
EMAIL_USERNAME=your@email.com
EMAIL_PASSWORD=your_email_password

# Admin Panel
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt_hash>
SESSION_SECRET=<random_string>

# Private cron endpoint for subscription reminders
CRON_SECRET=<random_string>
```

To generate a password hash:

```bash
node -e "require('bcryptjs').hash('YOUR_PASSWORD', 10).then(h => console.log(h))"
```

### Run

```bash
# Development (with auto-reload)
npx nodemon

# Production
npm start
```

The server starts on **http://localhost:3003**.

---

## 📡 API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/portfolio/:section` | Get portfolio data (`profile`, `skills`, `interests`, `resume`, `contact`, `projects`) |
| `GET` | `/api/settings/public` | Get public-safe image and analytics settings |
| `GET` | `/api/site` | Get public site navigation, labels, visibility, and testimonials config |
| `GET` | `/api/testimonials` | Get testimonials from Google Sheets |
| `POST` | `/send-email` | Submit contact form (rate-limited) |

### Admin (session-protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/admin/login` | Authenticate with username/password |
| `POST` | `/api/admin/logout` | End session |
| `GET` | `/api/admin/check` | Check auth status |
| `PUT` | `/api/admin/portfolio/:section` | Update a portfolio section |
| `GET` | `/api/admin/settings` | Read admin settings without exposing stored passwords |
| `PUT` | `/api/admin/settings` | Save SMTP, image, and analytics settings |
| `GET` | `/api/admin/site` | Read public site configuration |
| `PUT` | `/api/admin/site` | Save public site configuration |
| `POST` | `/api/admin/password` | Change admin password |
| `POST` | `/api/admin/uploads/:type` | Upload an authenticated image (`background`, `profile`, `project`, `general`) |
| `GET` | `/api/admin/subscriptions` | Read private subscription tracker data |
| `PUT` | `/api/admin/subscriptions` | Save subscription tracker data |
| `POST` | `/api/admin/subscriptions/reminders/run` | Manually run due reminder scan |
| `POST` | `/api/admin/subscriptions/test-email` | Send a test reminder email |

### Private Cron

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/cron/subscription-reminders` | Cron-only reminder endpoint protected by `Authorization: Bearer <CRON_SECRET>` |

---

## 🔒 Security

- **Helmet** — Strict Content Security Policy with whitelisted CDNs
- **Rate Limiting** — Email and admin-login throttling
- **Input Validation** — Length limits and format checks on all inputs
- **bcrypt** — Hashed admin password (never stored in plaintext)
- **Secret split** — Runtime SMTP password and admin password override are stored in gitignored `data/secrets.json`
- **Private operational data** — Subscription tracker data stays in gitignored `data/subscriptions.json`
- **Session Auth** — httpOnly, same-site cookies with 24h expiry
- **Atomic Saves** — Admin edits are written via temporary files before replacing JSON data
- **Scoped client scripting** — App interactions use external JS modules and event delegation

---

## 🧑‍💼 Admin Panel

Access at `/admin.html` after starting the server. Features:

- **Profile** — Edit name, tagline, about text, personal details, social links, SEO meta
- **Skills** — Add/remove skills with percentage sliders
- **Interests** — Manage interests with icon classes and color pickers
- **Resume** — Full editor for summary, experience, education, certifications, honors, research
- **Contact** — Edit address, emails, phones, social links
- **Projects** — Add, edit, delete, and reorder project cards
- **Subscriptions** — Track renewals for domains, SaaS, hosting, and client services with multiple email reminders per item
- **Settings** — Configure SMTP, admin password, site images, analytics, public navigation, section labels, section visibility, project labels, contact labels, and testimonials source

Changes save instantly to the JSON files and are reflected on the public site.

### Subscription Reminder Cron

The portfolio app owns the data and sends email. A scheduler only needs to call:

```http
POST https://your-domain.com/api/cron/subscription-reminders
Authorization: Bearer <CRON_SECRET>
```

An optional Cloudflare Worker scaffold is included in `workers/`. Copy the example Wrangler file, set `PORTFOLIO_CRON_URL`, add `CRON_SECRET` as a Wrangler secret, then deploy:

```bash
cd workers
copy subscription-reminder-wrangler.example.toml wrangler.toml
npx wrangler secret put CRON_SECRET
npx wrangler deploy
```

---

## 📬 Contact

- **Email**: [d.maiku@derrickml.com](mailto:d.maiku@derrickml.com)
- **LinkedIn**: [Derrick L. Mayiku](https://www.linkedin.com/in/derrick-l-mayiku/)
- **Twitter / X**: [@malderok01](https://twitter.com/malderok01)

---

## 📄 License

ISC © [Derrick L. Mayiku](https://derrickml.com)
