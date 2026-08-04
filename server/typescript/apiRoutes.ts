import { Router, Request, Response } from 'express';
import './config';

import { createACSToken, sendEmail, sendSms } from './acs';
import { initializeDb } from './initDatabase';
import { completeEmailSMSMessages, getSQLFromNLP } from './openAI';
import { answerWithFoundryIQ } from './foundryIQ';
import { getCustomers, queryDb } from './postgres';

const router = Router();

initializeDb().catch(err => console.error(err));

router.get('/acstoken', async (_req, res) => {
    try {
        res.json(await createACSToken());
    }
    catch (error) {
        console.error('ACS token creation failed:', error);
        res.status(500).json({ error: 'ACS token creation failed.' });
    }
});

router.get('/customers', async (req, res) => {
    try {
        const results = await getCustomers();
        if (results && results.rows) {
            res.json(results.rows);
        }
        else {
            res.json([]);
        }
    }
    catch (error) {
        console.error('Error retrieving customers:', error);
        res.status(500).json({ error: 'Error retrieving customers.' });
    }
});

router.post('/generateSql', async (req: Request, res: Response): Promise<void> => {
    const userPrompt = req.body.prompt;

    if (!userPrompt) {
        res.status(400).json({ error: 'Missing parameter "prompt".' });
        return;
    }

    try {
        // Call Azure OpenAI to convert the user prompt into a SQL query
        const sqlCommandObject = await getSQLFromNLP(userPrompt);

        let result: any[] = [];
        // Execute the SQL query
        if (sqlCommandObject && !sqlCommandObject.error) {
            result = await queryDb(sqlCommandObject) as any[];
        }
        else {
            result = [ { query_error : sqlCommandObject.error } ];
        }
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error generating or running SQL query.' });
    }
});

router.post('/sendEmail', async (req: Request, res: Response): Promise<void> => {
    const { subject, message, customerName, customerEmailAddress } = req.body;

    if (!subject || !message || !customerName || !customerEmailAddress) {
        res.status(400).json({
            status: false,
            message: 'The subject, message, customerName, and customerEmailAddress parameters must be provided!'
        });
        return;
    }

    try {
        const sendResults = await sendEmail(subject, message, customerName, customerEmailAddress);
        res.json({
            status: sendResults.status,
            messageId: sendResults.id
        });
    }
    catch (e: unknown) {
        console.error(e);
        res.status(500).json({
            status: false,
            messageId: ''
        });
    }
});

router.post('/sendSms', async (req: Request, res: Response): Promise<void> => {
    const message = req.body.message;
    const customerPhoneNumber = req.body.customerPhoneNumber;

    if (!message || !customerPhoneNumber) {
        res.status(400).json({
            status: false,
            message: 'The message and customerPhoneNumber parameters must be provided!'
        });
        return;
    }

    try {
        const [sendResult] = await sendSms(message, customerPhoneNumber);
        if (!sendResult) throw new Error('ACS returned no SMS send result.');
        res.json({
            status: sendResult.successful,
            messageId: sendResult.messageId
        });
    }
    catch (e: unknown) {
        console.error(e);
        res.status(500).json({
            status: false,
            messageId: ''
        });
    }
});

router.post('/completeEmailSmsMessages', async (req: Request, res: Response): Promise<void> => {
    const { prompt, company, contactName } = req.body;

    if (!prompt || !company || !contactName) {
        res.status(400).json({ 
            status: false, 
            error: 'The prompt, company, and contactName parameters must be provided.' 
        });
        return;
    }

    let result;
    try {
        // Call OpenAI to get the email and SMS message completions
       result = await completeEmailSMSMessages(prompt, company, contactName);
    }
    catch (e: unknown) {
        console.error('Error parsing JSON:', e);
    }

    res.json(result);
});

router.post('/foundryIq', async (req: Request, res: Response): Promise<void> => {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) {
        res.status(400).json({
            error: 'The prompt must be a nonempty string of at most 4,000 characters.'
        });
        return;
    }

    try {
        res.json(await answerWithFoundryIQ(prompt));
    }
    catch (error: unknown) {
        console.error('Foundry IQ request failed:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Foundry IQ request failed.'
        });
    }
});

export default router;