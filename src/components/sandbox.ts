import { Router, Request, Response } from 'express';

const router = Router();

// Replace this with the Tailscale IP of your Ubuntu VM!
const WORKER_URL = process.env.SANDBOX_WORKER_URL || 'http://100.107.181.80:3000';

router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { code, language } = req.body;

    // Determine a default name based on language
    let name = 'index.html';
    if (language === 'javascript') name = 'script.js';
    else if (language === 'python') name = 'script.py';

    // Forward the execution request to your secure Proxmox Ubuntu VM over Tailscale
    const workerResponse = await fetch(`${WORKER_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language, name })
    });

    const data = await workerResponse.json();

    if (!workerResponse.ok) {
      return res.status(workerResponse.status).json(data);
    }

    return res.json(data);
  } catch (error: any) {
    console.error('Failed to communicate with Sandbox Worker:', error);
    return res.status(500).json({ error: 'Sandbox worker is unreachable. Ensure the Tailscale connection is active.' });
  }
});

export default router;
export {};
