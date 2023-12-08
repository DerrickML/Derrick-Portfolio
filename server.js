const express = require('express');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Serve static files from the 'public' folder
app.use(express.static('public'));

app.use(express.json());

// Define the route for the email sending functionality
app.post('/send-email', (req, res) => {
    let transporter = nodemailer.createTransport({
        host: "derrickml.com",
        port: 465,
        secure: true, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USERNAME, // your email address
          pass: process.env.EMAIL_PASSWORD, // your email password
        },
      });
    
      let mailOptions = {
        from: process.env.EMAIL_USERNAME, //'"Your Name" <d.maiku@derrickml.com>', // sender address
        to: "d.maiku@derrickml.com", // list of receivers
        subject: req.body.subject, // Subject line
        text: `Message from ${req.body.name} (${req.body.email}): ${req.body.message}`, // plain text body
      };
    
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return console.log(error);
        }
        console.log('Message sent: %s', info.messageId);
        res.send({ message: "Email sent successfully!" });
      });
    });

app.listen(3003, () => {
  console.log('Server is running on port 3003');
});
