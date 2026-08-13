import 'dotenv/config';
import { buildApp } from './app.js';

const PORT = Number(process.env.PORT) || 4000;

const app = buildApp();

app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server running at ${address}`);
});
