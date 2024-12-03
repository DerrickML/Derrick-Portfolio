const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
// const { parse } = require('csv-parse/sync');
require('dotenv').config();

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

app.listen(3003, () => {
    console.log('Server is running on port 3003');
});

