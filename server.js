const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
const moment = require('moment-timezone');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const session = require('express-session');
require('dotenv').config();

moment.tz.setDefault('Africa/Nairobi'); // East Africa Time

const app = express();

// Security: Set secure HTTP headers with CSP whitelist for trusted CDNs
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://code.jquery.com",
                "https://cdn.jsdelivr.net",
                "https://www.googletagmanager.com",
                "https://www.google-analytics.com",
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://cdn.jsdelivr.net",
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdn.jsdelivr.net",
                "data:",
            ],
            imgSrc: ["'self'", "data:", "https://www.google-analytics.com"],
            connectSrc: [
                "'self'",
                "https://script.google.com",
                "https://www.google-analytics.com",
            ],
        },
    },
}));

// Serve static files from the 'public' folder
app.use(express.static('public'));

app.use(express.json());

// Session middleware for admin auth
app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // set to true if using HTTPS in production
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
}));

// Rate limiter for the email endpoint (5 requests per 15 minutes per IP)
const emailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many email requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Allowed portfolio data sections (whitelist to prevent path traversal)
const PORTFOLIO_SECTIONS = ['profile', 'skills', 'interests', 'resume', 'contact', 'projects'];

// Generic endpoint to serve portfolio data from JSON files
app.get('/api/portfolio/:section', (req, res) => {
    const section = req.params.section;
    if (!PORTFOLIO_SECTIONS.includes(section)) {
        return res.status(404).json({ error: 'Section not found' });
    }
    const filePath = path.join(__dirname, 'data', `${section}.json`);
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        console.error(`Error reading ${section}.json:`, err.message);
        res.status(500).json({ error: 'Error loading data' });
    }
});

/*======PRIVATE=====*/
//DOGS
// Path to members.json
const MEMBERS_FILE = path.join(__dirname, 'data', 'members.json');

function readMembers() {
    try {
        const data = fs.readFileSync(MEMBERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading members file:', err.message);
        return [];
    }
}

function writeMembers(members) {
    fs.writeFileSync(MEMBERS_FILE, JSON.stringify(members, null, 2), 'utf8');
}

function generateSchedule(members, daysToGenerate = 7) {
    const today = moment().startOf('day');

    // Initialize lastOpenedDate for sorting:
    members.forEach(m => {
        m.lastOpenedDate = m.lastOpened ? moment(m.lastOpened) : moment().subtract(1, 'year');
    });

    // Sort by oldest lastOpened first (older date = smaller/earlier = negative diff)
    members.sort((a, b) => {
        const diff = a.lastOpenedDate.diff(b.lastOpenedDate);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
    });

    let schedule = [];

    for (let i = 0; i < daysToGenerate; i++) {
        const day = moment(today).add(i, 'days');
        let assigned = false;

        // Pick the first available member (after sorting by lastOpened)
        for (let member of members) {
            if (member.available) {
                // Assign this member for the current day
                schedule.push({
                    date: day.format('YYYY-MM-DD'),
                    person: member.name
                });
                member.lastOpened = day.format();
                member.nextOpenDay = day.format('YYYY-MM-DD');
                assigned = true;
                break;
            }
        }

        // If nobody was available, record that
        if (!assigned) {
            schedule.push({
                date: day.format('YYYY-MM-DD'),
                person: 'No one available'
            });
        }

        // Recompute lastOpenedDate and re-sort for the next day’s assignment
        members.forEach(m => {
            m.lastOpenedDate = m.lastOpened ? moment(m.lastOpened) : moment().subtract(1, 'year');
        });
        members.sort((a, b) => a.lastOpenedDate.diff(b.lastOpenedDate));
    }

    return schedule;
}
//==== END DOGS
/*======END PRIVATE=====*/

/**
 * ROUTES
 */
//===== DOGS
// Endpoint to get the current schedule
// Endpoint to get members data
app.get('/api/members', (req, res) => {
    const members = readMembers();
    res.json(members);
});
// After updating a member’s availability:
app.post('/api/updateAvailability', (req, res) => {
    const { name, available } = req.body;
    if (!name || typeof name !== 'string' || name.length > 100 || typeof available !== 'boolean') {
        return res.status(400).json({ error: 'Invalid data. Name must be a non-empty string and available must be a boolean.' });
    }

    let members = readMembers();
    const member = members.find(m => m.name === name);
    if (!member) {
        return res.status(404).json({ error: 'Member not found' });
    }

    member.available = available;
    writeMembers(members);

    // Recalculate schedule immediately after change
    const days = 7;
    const schedule = generateSchedule(members, days);
    writeMembers(members); // persist new lastOpened, nextOpenDay

    // Optionally store schedule in memory or a separate file
    fs.writeFileSync(path.join(__dirname, 'data', 'schedule.json'), JSON.stringify(schedule, null, 2));

    res.json({ success: true, schedule, members });
});

// Serve the stored schedule
app.get('/api/schedule', (req, res) => {
    let members = readMembers();
    const days = 7;
    const schedule = generateSchedule(members, days);
    writeMembers(members); // persist updated lastOpened
    res.json({ schedule });
});
//===== END DOGS

//===== PORTFOLIO
// Add this route to serve the testimonials data
app.get('/api/testimonials', async (req, res) => {
    try {
        const response = await fetch('https://script.google.com/macros/s/AKfycbyNpfflHQUWQ1TzMOEu5S28L23X-KogevFd1K201jzjD_pHUeTIqm0kjegRyACGq-FreA/exec');
        const data = await response.json();

        console.log(data);

        // Map the data to match your frontend structure
        // Normalize keys by trimming whitespace (Google Sheets headers have trailing spaces)
        const testimonials = data.map(item => {
            const trimmed = {};
            for (const key of Object.keys(item)) {
                trimmed[key.trim()] = item[key];
            }
            return {
                quote: trimmed['Testimonial Quote'] || '',
                name: trimmed['Full Name'] || '',
                title: trimmed['Position/Title'] || '',
                image: 'assets/img/testimonials/placeholder.png',
            };
        });

        res.json(testimonials);
    } catch (error) {
        console.error('Error fetching testimonials:', error);
        res.status(500).send('Error fetching testimonials');
    }
});


// Define the route for the email sending functionality
app.post('/send-email', emailLimiter, (req, res) => {
    // Input validation
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: 'All fields (name, email, subject, message) are required.' });
    }
    if (typeof name !== 'string' || typeof email !== 'string' || typeof subject !== 'string' || typeof message !== 'string') {
        return res.status(400).json({ error: 'All fields must be strings.' });
    }
    if (name.length > 200 || email.length > 254 || subject.length > 500 || message.length > 5000) {
        return res.status(400).json({ error: 'One or more fields exceed the maximum allowed length.' });
    }
    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email address format.' });
    }

    let transporter = nodemailer.createTransport({
        host: 'derrickml.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD
        }
    });

    let mailOptions = {
        from: process.env.EMAIL_USERNAME,
        to: 'd.maiku@derrickml.com',
        subject: subject.substring(0, 500),
        text: `Message from ${name.substring(0, 200)} (${email}): ${message.substring(0, 5000)}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error sending email');
        } else {
            console.log('Message sent: %s', info.messageId);
            res.send({ message: 'Email sent successfully!' });
        }
    });
});
//==== END PORTFOLIO

/*======= ADMIN PANEL =======*/
// Auth middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

// Login
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (username !== process.env.ADMIN_USERNAME) {
        return res.status(401).json({ error: 'Invalid credentials.' });
    }
    try {
        const match = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        req.session.isAdmin = true;
        res.json({ success: true, message: 'Logged in successfully.' });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// Logout
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: 'Logged out.' });
    });
});

// Session check
app.get('/api/admin/check', (req, res) => {
    res.json({ authenticated: !!(req.session && req.session.isAdmin) });
});

// Update portfolio section (protected)
app.put('/api/admin/portfolio/:section', requireAuth, (req, res) => {
    const section = req.params.section;
    if (!PORTFOLIO_SECTIONS.includes(section)) {
        return res.status(404).json({ error: 'Section not found.' });
    }
    const filePath = path.join(__dirname, 'data', `${section}.json`);
    try {
        // Validate that body is proper JSON by stringifying and parsing
        const jsonStr = JSON.stringify(req.body, null, 2);
        JSON.parse(jsonStr); // sanity check
        fs.writeFileSync(filePath, jsonStr, 'utf8');
        res.json({ success: true, message: `${section} updated successfully.` });
    } catch (err) {
        console.error(`Error writing ${section}.json:`, err.message);
        res.status(500).json({ error: 'Error saving data.' });
    }
});
/*======= END ADMIN PANEL =======*/

app.listen(3003, () => {
    console.log('Server is running on port 3003');
});

