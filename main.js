const open_module = require('./positions_move/open_position.js')
const close_module = require('./positions_move/close_position.js')
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/open', async (req, res) => {
    const data = req.body;
    const result = await open_module.open_position(data.amount, data.asset_id, data.user_id)
    res.json({ result: result });
});

app.post('/api/close', async (req, res) => {
    const data = req.body;
    const result = await close_module.close_position(data.amount, data.asset_id, data.user_id)
    res.json({ result: result });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
