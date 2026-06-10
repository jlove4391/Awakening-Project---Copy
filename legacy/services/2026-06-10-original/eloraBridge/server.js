import app from './index.js';

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`✅ Elora Bridge listening on port ${PORT}`);
});
