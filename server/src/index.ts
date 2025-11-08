import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3000);

const { app } = buildApp();

app.listen(port, () => {
  console.log(`Action item service listening on port ${port}`);
});
