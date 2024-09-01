const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
const { calcNeedAmount } = require('../utils_code.js');
const config = require('../values.js');

class DatabaseHandler {
  constructor(databasePath) {
    this.db = new sqlite3.Database(databasePath, (err) => {
      if (err) {
        console.error("Error opening database:", err.message);
      }
    });
    this.dbRun = promisify(this.db.run.bind(this.db));
    this.dbGet = promisify(this.db.get.bind(this.db));
  }

  async checkDataToOpen(amount, asset_id, user_id) {
    try {
      console.log("Starting transaction...");
      await this.dbRun("BEGIN TRANSACTION");

      const row = await this.dbGet("SELECT * FROM assets WHERE asset_id = ?", [asset_id]);

      if (!row) {
        console.log("No asset found with the given asset_id.");
        await this.dbRun("ROLLBACK");
        return 1;
      }

      const asset_mint = row.contract_address;
      const need_balance = await calcNeedAmount(amount, asset_mint);

      const row1 = await this.dbGet("SELECT * FROM clients WHERE client_id = ?", [user_id]);
      if (!row1) {
        console.log("No client found with the given user_id.");
        await this.dbRun("ROLLBACK");
        return 2;
      }
      const user_balance = row1.balance_quote;

      if (user_balance < need_balance) {
        console.log("Balance lower.");
        await this.dbRun("ROLLBACK");
        return 3;
      }

      console.log("Transaction committed successfully.");
      await this.dbRun("COMMIT");
      return {
        need_balance: need_balance,
        asset_mint: asset_mint
      }
    } catch (err) {
      await this.dbRun("ROLLBACK");
      console.error("Transaction failed. Changes rolled back.", err);
    }
  }

  async checkDataToClose(amount, asset_id, user_id) {
    try {
      console.log("Starting transaction...");
      await this.dbRun("BEGIN TRANSACTION");

      const row = await this.dbGet("SELECT * FROM assets WHERE asset_id = ?", [asset_id]);

      if (!row) {
        console.log("No asset found with the given asset_id.");
        await this.dbRun("ROLLBACK");
        return 1;
      }

      const asset_mint = row.contract_address;
      const add_balance = await calcNeedAmount(amount, asset_mint);

      const row1 = await this.dbGet("SELECT * FROM clients WHERE client_id = ?", [user_id]);
      if (!row1) {
        console.log("No client found with the given user_id.");
        await this.dbRun("ROLLBACK");
        return 2;
      }
      const user_balance = row1.balance_tokens;

      if (user_balance < amount) {
        console.log("Balance lower.");
        await this.dbRun("ROLLBACK");
        return 3;
      }

      console.log("Transaction committed successfully.");
      await this.dbRun("COMMIT");
      return {
        add_balance: add_balance,
        asset_mint: asset_mint
      }
    } catch (err) {
      await this.dbRun("ROLLBACK");
      console.error("Transaction failed. Changes rolled back.", err);
    }
  }

  async pend_transaction(user_id, asset_id, type, position, amount, sol_amount, status, date) {
    try {
      console.log("Starting transaction...");
      await this.dbRun("BEGIN TRANSACTION");

      await this.dbRun(
        `INSERT INTO transactions (user_id, asset_id, transaction_type, position_type, amount_token, quote_amount, status, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [user_id, asset_id, type, position, amount, sol_amount, status, date]
      );

      const row = await this.dbGet("SELECT * FROM transactions WHERE user_id = ? AND asset_id = ? AND status = ? AND date = ?", [user_id, asset_id, status, date]);
      const id = row.transaction_id;

      console.log("Transaction committed successfully.");
      await this.dbRun("COMMIT");

      return id
    } catch (err) {
      await this.dbRun("ROLLBACK");
      console.error("Transaction failed. Changes rolled back.", err);
    }
  }

  async success_transaction(user_id, transaction_id, amount, sol_amount, status_post, success_date, signature, type) {
    try {
      console.log("Starting transaction...");
      await this.dbRun("BEGIN TRANSACTION");

      await this.dbRun(
        `UPDATE transactions 
        SET status = ?, dex_transaction_id = ?, date = ? 
        WHERE user_id = ? AND transaction_id = ?`,
        [status_post, signature, success_date, user_id, transaction_id]
      );

      await this.update_user_data(type, user_id, sol_amount, amount)

      console.log("Transaction committed successfully.");
      await this.dbRun("COMMIT");
    } catch (err) {
      await this.dbRun("ROLLBACK");
      console.error("Transaction failed. Changes rolled back.", err);
    }
  }

  async update_user_data(type, user_id, sol_amount, amount) {
    let char1;
    let char2;

    if (type === config.close_pos) {
      char1 = "+";
      char2 = "-";
    } else if (type === config.open_pos) {
      char1 = "-";
      char2 = "+";
    }

    await this.dbRun(
      `UPDATE clients SET balance_quote = balance_quote ${char1} ?, balance_tokens = balance_tokens ${char2} ? WHERE client_id = ?`,
      [sol_amount, amount, user_id]
    );
  }

  close() {
    this.db.close((err) => {
      if (err) {
        console.error("Error closing database:", err.message);
      } else {
        console.log("Database connection closed.");
      }
    });
  }
}

module.exports = DatabaseHandler;
