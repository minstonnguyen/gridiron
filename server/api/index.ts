import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';

const app = createApp();
// Serve the built SPA when running as a single full-stack process.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
app.use(express.static(dist, { maxAge: '1h', index: 'index.html' }));
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`GRIDIRON API listening on :${port}`));
