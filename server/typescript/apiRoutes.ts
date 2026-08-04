import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import './config';

import { createACSToken, sendEmail, sendSms } from './acs';
import { completeEmailSMSMessages, getSQLFromNLP } from './openAI';
import { answerWithFoundryIQ } from './foundryIQ';
import { getCustomers, queryDb } from './postgres';

const router = Router();
const aiLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
const communicationLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });

router.get('/acstoken', communicationLimiter, async (_req, res) => {
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

router.post('/generateSql', aiLimiter, async (req: Request, res: Response): Promise<void> => {
    const userPrompt = req.body.prompt;

    if (typeof userPrompt !== 'string' || !userPrompt.trim() || userPrompt.length > 4000) {
        res.status(400).json({ error: 'The prompt must be a nonempty string of at most 4,000 characters.' });
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

router.post('/sendEmail', communicationLimiter, async (req: Request, res: Response): Promise<void> => {
    const { subject, message, customerName, customerEmailAddress } = req.body;

    if (typeof subject !== 'string' || !subject.trim() || subject.length > 500 ||
        typeof message !== 'string' || !message.trim() || message.length > 10_000 ||
        typeof customerName !== 'string' || !customerName.trim() || customerName.length > 200 ||
        typeof customerEmailAddress !== 'string' || !customerEmailAddress.trim()) {
        res.status(400).json({
            status: false,
            message: 'The subject, message, customerName, and customerEmailAddress parameters must be provided!'
        });
        return;
    }

    try {
        const approvedDestination = process.env.CUSTOMER_EMAIL_ADDRESS;
        if (!approvedDestination) {
            res.status(503).json({ status: false, message: 'Email delivery is not configured.' });
            return;
        }
        const sendResults = await sendEmail(subject, message, customerName, approvedDestination);
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

router.post('/sendSms', communicationLimiter, async (req: Request, res: Response): Promise<void> => {
    const message = req.body.message;
    const customerPhoneNumber = req.body.customerPhoneNumber;

    if (typeof message !== 'string' || !message.trim() || message.length > 160 ||
        typeof customerPhoneNumber !== 'string' || !customerPhoneNumber.trim()) {
        res.status(400).json({
            status: false,
            message: 'The message and customerPhoneNumber parameters must be provided!'
        });
        return;
    }

    try {
        const approvedDestination = process.env.CUSTOMER_PHONE_NUMBER;
        if (!approvedDestination) {
            res.status(503).json({ status: false, message: 'SMS delivery is not configured.' });
            return;
        }
        const [sendResult] = await sendSms(message, approvedDestination);
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

router.post('/completeEmailSmsMessages', aiLimiter, async (req: Request, res: Response): Promise<void> => {
    const { prompt, company, contactName } = req.body;

    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000 ||
        typeof company !== 'string' || !company.trim() || company.length > 200 ||
        typeof contactName !== 'string' || !contactName.trim() || contactName.length > 200) {
        res.status(400).json({ 
            status: false, 
            error: 'The prompt, company, and contactName parameters must be provided.' 
        });
        return;
    }

    try {
        res.json(await completeEmailSMSMessages(prompt, company, contactName));
    }
    catch (error: unknown) {
        console.error('Message generation failed:', error);
        res.status(500).json({ status: false, error: 'Message generation failed.' });
    }
});

router.post('/foundryIq', aiLimiter, async (req: Request, res: Response): Promise<void> => {
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
            error: 'Foundry IQ request failed.'
        });
    }
});

export default router;