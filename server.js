const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { parse } = require('csv-parse/sync');
require('dotenv').config();

const app = express();

// Serve static files from the 'public' folder
app.use(express.static('public'));

app.use(express.json());

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

// Endpoint to get all portfolio items
app.get('/api/portfolio', (req, res) => {
    try {
        const fileContent = fs.readFileSync(path.join(__dirname, 'public/assets/docs/portfolio.csv'));
        const records = parse(fileContent, { columns: true });
        res.json(records);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error reading portfolio data');
    }
});

// Endpoint to get a specific portfolio item by ID
app.get('/api/portfolio/:id', (req, res) => {
    try {
        const id = req.params.id;
        const fileContent = fs.readFileSync(path.join(__dirname, 'public/assets/docs/portfolio.csv'));
        const records = parse(fileContent, { columns: true });
        const portfolioItem = records.find(item => item.id === id);

        if (portfolioItem) {
            res.json(portfolioItem);
        } else {
            res.status(404).send('Item not found');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error processing request');
    }
});

app.listen(3003, () => {
    console.log('Server is running on port 3003');
});
