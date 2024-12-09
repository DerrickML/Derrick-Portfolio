const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
const moment = require('moment-timezone');
// const { parse } = require('csv-parse/sync');
require('dotenv').config();

moment.tz.setDefault('Africa/Nairobi'); // East Africa Time

const app = express();

// Serve static files from the 'public' folder
app.use(express.static('public'));

app.use(express.json());

// Add this near the top of your server.js file
const testimonialsData = [
    {
        quote: "Proin iaculis purus consequat sem cure digni ssim donec porttitora entum suscipit rhoncus...",
        image: "assets/img/testimonials/testimonials-1.jpg",
        name: "Saul Goodman",
        title: "CEO & Founder"
    },
    {
        quote: "Export tempor illum tamen malis malis eram quae irure esse labore quem cillum quid cillum eram malis...",
        image: "assets/img/testimonials/testimonials-2.jpg",
        name: "Sara Wilsson",
        title: "Designer"
    },
    // Add more testimonials as needed
];

/*======PRIVATE=====*/
//DOGS
// Path to members.json
const MEMBERS_FILE = path.join(__dirname, 'data', 'members.json');

function readMembers() {
    const data = fs.readFileSync(MEMBERS_FILE, 'utf8');
    return JSON.parse(data);
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
    if (!name || typeof available !== 'boolean') {
        return res.status(400).json({ error: 'Invalid data' });
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
        console.log(data)
        
        // Map the data to match your frontend structure
        const testimonials = data.map(item => ({
            quote: item['Testimonial Quote'],
            name: item['Full Name'],
            title: item['Position/Title'],
            image: 'assets/img/testimonials/placeholder.png' // Use a placeholder image
        }));
        
        res.json(testimonials);
    } catch (error) {
        console.error('Error fetching testimonials:', error);
        res.status(500).send('Error fetching testimonials');
    }
});


// Define the route for the email sending functionality
app.post('/send-email', (req, res) => {
    let transporter = nodemailer.createTransport({
        host: 'derrickml.com',
        port: 465,
        secure: true, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USERNAME, // your email address
            pass: process.env.EMAIL_PASSWORD // your email password
        }
    });

    let mailOptions = {
        from: process.env.EMAIL_USERNAME, // sender address
        to: 'd.maiku@derrickml.com', // list of receivers
        subject: req.body.subject, // Subject line
        text: `Message from ${req.body.name} (${req.body.email}): ${req.body.message}` // plain text body
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

app.listen(3003, () => {
    console.log('Server is running on port 3003');
});

