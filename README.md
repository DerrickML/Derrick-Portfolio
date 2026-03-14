# Derrick L. Mayiku — Personal Portfolio

A dynamic personal portfolio showcasing skills, experience, and projects. Built with **Express.js** and vanilla frontend, featuring a data-driven architecture with a built-in **admin panel** for real-time content management.

🔗 **Live**: [derrickml.com](https://derrickml.com)

---

## ✨ Features

- **Dynamic Content** — All portfolio data (profile, skills, interests, resume, contact) is stored in JSON files and rendered dynamically via API
- **Admin Dashboard** — Password-protected panel at `/admin.html` to edit all content sections in real-time
- **Testimonials** — Loaded from an external Google Sheets API
- **Contact Form** — Server-side email delivery via Nodemailer with CAPTCHA protection
- **Security Hardened** — Helmet CSP headers, rate limiting, input validation, bcrypt auth

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Server** | Node.js, Express 4 |
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
├── nodemon.json
│
├── data/                  # JSON data store
│   ├── profile.json       # Name, tagline, about text, details, social links
│   ├── skills.json        # Skills with percentages
│   ├── interests.json     # Interests with icons and colors
│   ├── resume.json        # Summary, experience, education, certs, honors
│   └── contact.json       # Address, emails, phones, social links
│
└── public/                # Static frontend
    ├── index.html         # Main portfolio page
    ├── admin.html         # Admin dashboard
    └── assets/
        ├── css/style.css
        ├── img/
        ├── js/
        │   ├── main.js          # Template UI logic
        │   ├── data-loader.js   # Fetches JSON data, renders sections
        │   ├── admin.js         # Admin auth, form editors, save logic
        │   ├── contact-form.js  # Contact form submission
        │   └── testimonials.js  # Testimonials carousel
        └── vendor/              # Bootstrap, Swiper, GLightbox, etc.
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v16+

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
| `GET` | `/api/portfolio/:section` | Get portfolio data (`profile`, `skills`, `interests`, `resume`, `contact`) |
| `GET` | `/api/testimonials` | Get testimonials from Google Sheets |
| `POST` | `/send-email` | Submit contact form (rate-limited) |

### Admin (session-protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/admin/login` | Authenticate with username/password |
| `POST` | `/api/admin/logout` | End session |
| `GET` | `/api/admin/check` | Check auth status |
| `PUT` | `/api/admin/portfolio/:section` | Update a portfolio section |

---

## 🔒 Security

- **Helmet** — Strict Content Security Policy with whitelisted CDNs
- **Rate Limiting** — 5 email requests per 15 minutes per IP
- **Input Validation** — Length limits and format checks on all inputs
- **bcrypt** — Hashed admin password (never stored in plaintext)
- **Session Auth** — httpOnly cookies with 24h expiry
- **No inline scripts** — CSP-compliant event delegation

---

## 🧑‍💼 Admin Panel

Access at `/admin.html` after starting the server. Features:

- **Profile** — Edit name, tagline, about text, personal details, social links, SEO meta
- **Skills** — Add/remove skills with percentage sliders
- **Interests** — Manage interests with icon classes and color pickers
- **Resume** — Full editor for summary, experience, education, certifications, honors, research
- **Contact** — Edit address, emails, phones, social links

Changes save instantly to the JSON files and are reflected on the public site.

---

## 📬 Contact

- **Email**: [d.maiku@derrickml.com](mailto:d.maiku@derrickml.com)
- **LinkedIn**: [Derrick L. Mayiku](https://www.linkedin.com/in/derrick-l-mayiku/)
- **Twitter / X**: [@malderok01](https://twitter.com/malderok01)

---

## 📄 License

ISC © [Derrick L. Mayiku](https://derrickml.com)
