const DatabaseHandler = require('../db/db.js');
const sell_module = require('../swaps/sell.js');
const config = require('../values.js');
const utils_code = require('../utils_code.js');

async function close_position(amount, asset_id, user_id) {

    const dbHandler = new DatabaseHandler('./db/ls_db.db');

    const data = await dbHandler.checkDataToClose(amount, asset_id, user_id)
    if (data === 1) {
        return "No asset found with the given asset_id."
    } else if (data == 2) {
        return "No client found with the given user_id."
    } else if (data === 3) {
        return "Balance lower."
    }

    const pending_date = utils_code.get_format_date();
    const transaction_id = await dbHandler.pend_transaction(user_id, asset_id, config.long_type, config.close_pos, amount, data.add_balance, config.status_pen, pending_date)

    const signature = await sell_module.sell(config.key, config.rpc, config.Sol, data.asset_mint, amount, config.gas, config.slippage)

    const success_date = utils_code.get_format_date();
    await dbHandler.success_transaction(user_id, transaction_id, amount, data.add_balance, config.status_suc, success_date, signature, config.close_pos)

    return signature
}

module.exports = {
    close_position
}