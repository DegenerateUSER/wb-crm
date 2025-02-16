const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

app.post('/freshdesk-webbook', (req, res) => {
    const payload = req.body;

    console.log('Received webhook payload:', payload);

    // Process the payload
    const ticketId = payload.ticket_id;


    // Add your logic here (e.g., send updates to WhatsApp)
    console.log(`Ticket ID: ${ticketId}`);

    res.status(200).send('Webhook received');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Webhook server running on port ${port}`);
});